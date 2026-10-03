"""Fail a Windows release if app.exe needs the Visual C++ runtime to start.

The in-app installation check can repair a missing sidecar DLL only when the
main process reaches main(). A DLL in the PE import table is loaded earlier.
Windows 10/11 provide the Universal CRT and api-ms-win-crt API contracts as OS
components; these do not depend on the app-local Visual C++ redistributable.
"""

from __future__ import annotations

import argparse
import re
import struct
from pathlib import Path


VC_RUNTIME = re.compile(
    r"^(?:msvcp.*|msvcr.*|vcruntime.*|concrt.*|vcomp.*)\.dll$",
    re.IGNORECASE,
)


def imports(path: Path) -> list[str]:
    data = path.read_bytes()

    def u16(offset: int) -> int:
        return struct.unpack_from("<H", data, offset)[0]

    def u32(offset: int) -> int:
        return struct.unpack_from("<I", data, offset)[0]

    if len(data) < 64 or data[:2] != b"MZ":
        raise ValueError(f"{path} is not a Windows executable")
    pe = u32(0x3C)
    if data[pe : pe + 4] != b"PE\0\0":
        raise ValueError(f"{path} has no PE header")

    coff = pe + 4
    section_count = u16(coff + 2)
    optional_size = u16(coff + 16)
    optional = coff + 20
    magic = u16(optional)
    if magic == 0x20B:  # PE32+
        directory_count = u32(optional + 108)
        directories = optional + 112
    elif magic == 0x10B:  # PE32
        directory_count = u32(optional + 92)
        directories = optional + 96
    else:
        raise ValueError(f"{path} has an unsupported PE optional header")
    if directory_count < 2:
        return []
    import_rva = u32(directories + 8)
    if import_rva == 0:
        return []

    sections = []
    section_table = optional + optional_size
    for index in range(section_count):
        entry = section_table + index * 40
        virtual_size = u32(entry + 8)
        virtual_address = u32(entry + 12)
        raw_size = u32(entry + 16)
        raw_offset = u32(entry + 20)
        sections.append((virtual_address, virtual_address + max(virtual_size, raw_size), raw_offset))

    def file_offset(rva: int) -> int:
        for start, end, raw_offset in sections:
            if start <= rva < end:
                offset = raw_offset + rva - start
                if offset < len(data):
                    return offset
        raise ValueError(f"{path} has an invalid import RVA 0x{rva:X}")

    descriptor = file_offset(import_rva)
    result = []
    for _ in range(4096):
        if descriptor + 20 > len(data):
            raise ValueError(f"{path} has a truncated import table")
        if data[descriptor : descriptor + 20] == bytes(20):
            return result
        name_offset = file_offset(u32(descriptor + 12))
        name_end = data.find(b"\0", name_offset)
        if name_end < 0:
            raise ValueError(f"{path} has an unterminated import name")
        result.append(data[name_offset:name_end].decode("ascii"))
        descriptor += 20
    raise ValueError(f"{path} has too many import descriptors")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("executable", type=Path)
    args = parser.parse_args()
    names = imports(args.executable)
    blocked = [name for name in names if VC_RUNTIME.fullmatch(name)]
    if blocked:
        print(f"FAIL: {args.executable} imports Visual C++ runtime DLLs before main(): {', '.join(blocked)}")
        return 1
    print(f"PASS: {args.executable} has no app-local Visual C++ redistributable DLL in its PE import table.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
