const portInput = document.getElementById('port');
const tokenInput = document.getElementById('token');
const status = document.getElementById('status');
chrome.storage.local.get(['port', 'token']).then(({ port, token }) => {
  if (port) portInput.value = String(port);
  if (token) tokenInput.value = token;
});
document.getElementById('pairForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const port = Number(portInput.value);
  const token = tokenInput.value.trim();
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !token) {
    status.textContent = 'Enter the port and pairing key shown in FlowSight.';
    return;
  }
  await chrome.storage.local.set({ port, token });
  try {
    await chrome.runtime.sendMessage({ type: 'poll-now' });
    status.textContent = 'Saved. Check the connected status in FlowSight.';
  } catch (error) {
    status.textContent = `Saved, but could not connect: ${error.message}`;
  }
});
