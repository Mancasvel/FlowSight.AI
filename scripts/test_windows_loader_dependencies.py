"""Distinguish OS runtime contracts from repairable app-local VC sidecars."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "loader_dependencies", Path(__file__).with_name("check-windows-loader-dependencies.py")
)
loader_dependencies = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loader_dependencies)


class RuntimeImportTests(unittest.TestCase):
    def test_app_local_visual_cpp_dependencies_still_block_release(self):
        for name in (
            "msvcp140.dll", "vcruntime140.dll", "VCRUNTIME140_1.DLL",
            "msvcr120.dll", "concrt140.dll", "vcomp140.dll",
        ):
            with self.subTest(name=name):
                self.assertIsNotNone(loader_dependencies.VC_RUNTIME.fullmatch(name))

    def test_windows_10_and_11_os_contracts_do_not_require_sidecar_repair(self):
        for name in (
            "ucrtbase.dll", "api-ms-win-crt-math-l1-1-0.dll",
            "api-ms-win-crt-string-l1-1-0.dll", "api-ms-win-crt-runtime-l1-1-0.dll",
            "kernel32.dll", "user32.dll",
        ):
            with self.subTest(name=name):
                self.assertIsNone(loader_dependencies.VC_RUNTIME.fullmatch(name))


if __name__ == "__main__":
    unittest.main()
