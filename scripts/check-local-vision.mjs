/**
 * Release smoke test for the exact Qwen3-VL-2B-Instruct llama-server contract used by the app.
 * The image is a tiny, synthetic PNG; this checks loading and the multimodal API,
 * not classification accuracy. No user screen, account, or database is read.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

const root = resolve(import.meta.dirname, "..");
const bin = join(root, "local_llm", "bin", process.platform === "win32" ? "llama-server.exe" : "llama-server");
const model = join(root, "local_llm", "Qwen3VL-2B-Instruct-Q4_K_M.gguf");
const projector = join(root, "local_llm", "mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf");
const alias = "flowsight-qwen3vl-2b-instruct";
// A public-domain 1x1 PNG. Its content is deliberately not used as an accuracy test.
const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+FQAAAAASUVORK5CYII=";

for (const file of [bin, model, projector]) {
  if (!existsSync(file)) throw new Error(`Required local model asset is missing: ${file}`);
}

const port = await new Promise((done, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const selected = server.address().port;
    server.close(() => done(selected));
  });
});

const args = [
  "-m", model,
  "--mmproj", projector,
  "--alias", alias,
  "--reasoning-budget", "0",
  "--chat-template-kwargs", '{"enable_thinking":false}',
  "--host", "127.0.0.1",
  "--port", String(port),
  "--ctx-size", "4096",
  "--parallel", "2",
  "--threads", "2",
  "--n-gpu-layers", "0",
];
const child = spawn(bin, args, {
  cwd: join(root, "local_llm", "bin"),
  env: { ...process.env, GGML_DISABLE_VULKAN: "1", LLAMA_ARG_DEVICE: "none" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let tail = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    tail = (tail + chunk.toString()).slice(-6000);
  });
}

const origin = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 180_000;
try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`llama-server exited ${child.exitCode}\n${tail}`);
    try {
      const health = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(3000) });
      if (health.ok && (await health.json()).status === "ok") break;
    } catch { /* still loading */ }
    await new Promise((done) => setTimeout(done, 1000));
  }
  if (Date.now() >= deadline) throw new Error(`llama-server did not become healthy\n${tail}`);

  const response = await fetch(`${origin}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: alias,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Answer briefly: what is visible in the attached image?" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${image}` } },
        ],
      }],
      temperature: 0,
      max_tokens: 80,
      stream: false,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Multimodal request failed (${response.status}): ${JSON.stringify(body)}`);
  const answer = body?.choices?.[0]?.message?.content?.trim();
  if (body.model !== alias || !answer) {
    throw new Error(`Wrong model alias or empty multimodal content: ${JSON.stringify(body)}`);
  }
  const reasoning = body?.choices?.[0]?.message?.reasoning_content?.trim();
  if (reasoning) {
    throw new Error(`Unexpected reasoning content from Instruct (${reasoning.length} chars)`);
  }
  console.log(`[check-local-vision] OK: ${alias}, multimodal response ${answer.length} chars`);

  // The proactive reminder feature uses a real local OpenAI-compatible tool
  // call. A forced canary checks llama.cpp's parser/template independently of
  // whether the model chooses to notify in a particular user situation.
  const toolResponse = await fetch(`${origin}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: alias,
      messages: [
        { role: "system", content: "Call the supplied tool once with advice=choose_one_task. Do not write prose." },
        { role: "user", content: JSON.stringify({ signal: "context_switching", switches: 12, unique_apps: 3, span_seconds: 200 }) },
      ],
      tools: [{
        type: "function",
        function: {
          name: "send_focus_notification",
          description: "Propose one local focus reminder.",
          parameters: {
            type: "object",
            properties: { advice: { type: "string", enum: ["choose_one_task"] } },
            required: ["advice"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: "required",
      temperature: 0,
      max_tokens: 100,
      stream: false,
    }),
  });
  const toolBody = await toolResponse.json();
  if (!toolResponse.ok) throw new Error(`Local tool call failed (${toolResponse.status}): ${JSON.stringify(toolBody)}`);
  const call = toolBody?.choices?.[0]?.message?.tool_calls?.[0];
  let args;
  try { args = typeof call?.function?.arguments === "string" ? JSON.parse(call.function.arguments) : call?.function?.arguments; }
  catch { /* checked below */ }
  if (toolBody.model !== alias || call?.function?.name !== "send_focus_notification" || args?.advice !== "choose_one_task") {
    throw new Error(`Local model did not produce a valid tool call: ${JSON.stringify(toolBody)}`);
  }
  console.log(`[check-local-vision] OK: ${alias}, local focus-notification tool call`);

  const autoResponse = await fetch(`${origin}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: alias,
      messages: [
        { role: "system", content: "You are FlowSight's local focus reminder planner. You see only verified aggregate signals. You may call send_focus_notification at most once, or make no tool call. App switching can be productive; abstain if a reminder would be speculative or interruptive. Never invent a cause, app, task, emotion, or diagnosis. The app will create the actual notification using fixed private copy; you only choose an allowed advice code." },
        { role: "user", content: JSON.stringify({ signal: "non_work_browsing", minimum_episode_seconds: 120, episodes_today: 3 }) },
      ],
      tools: [{
        type: "function",
        function: {
          name: "send_focus_notification",
          description: "Propose one evidence-grounded focus reminder. The host application validates the signal, permission, cooldown and advice before showing anything.",
          parameters: {
            type: "object",
            properties: { advice: { type: "string", enum: ["choose_one_task", "finish_current_step", "pause_and_prioritize", "return_to_task", "timebox_browsing", "intentional_break"] } },
            required: ["advice"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: "auto",
      temperature: 0,
      max_tokens: 100,
      stream: false,
    }),
  });
  const autoBody = await autoResponse.json();
  if (!autoResponse.ok) throw new Error(`Auto tool choice failed (${autoResponse.status}): ${JSON.stringify(autoBody)}`);
  const autoCall = autoBody?.choices?.[0]?.message?.tool_calls?.[0];
  let autoArgs;
  try { autoArgs = typeof autoCall?.function?.arguments === "string" ? JSON.parse(autoCall.function.arguments) : autoCall?.function?.arguments; }
  catch { /* checked below */ }
  if (autoCall?.function?.name !== "send_focus_notification" || !["return_to_task", "timebox_browsing", "intentional_break"].includes(autoArgs?.advice)) {
    throw new Error(`Auto reminder decision was missing or ungrounded: ${JSON.stringify(autoBody)}`);
  }
  console.log(`[check-local-vision] OK: auto reminder decision ${autoArgs.advice}`);
} finally {
  child.kill(); // Only the child launched by this test; never kill an installed FlowSight server.
}
