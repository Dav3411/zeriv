/**
 * comfyui.ts — ComfyUI HTTP API client for model candidate generation.
 * Ported from podcast_maker.py (_build_comfyui_workflow, _submit, _wait, _fetch)
 */

const COMFYUI_URL = (
  process.env.COMFYUI_URL ?? "http://127.0.0.1:8188"
).replace(/\/+$/, "");
const COMFYUI_CHECKPOINT = process.env.COMFYUI_CHECKPOINT ?? "";
const COMFYUI_ZIT_CHECKPOINT = process.env.COMFYUI_ZIT_CHECKPOINT ?? "";
const COMFYUI_ZIT_LORA = process.env.COMFYUI_ZIT_LORA ?? "";
const COMFYUI_ZIT_LORA_STRENGTH = parseFloat(
  process.env.COMFYUI_ZIT_LORA_STRENGTH ?? "0.8",
);

// ---------------------------------------------------------------------------
// Workflow builder
// ---------------------------------------------------------------------------

type WorkflowNode = {
  class_type: string;
  inputs: Record<string, unknown>;
};

export function buildComfyuiWorkflow(
  positivePrompt: string,
  seed: number,
  styleVibe = "",
  width = 1024,
  height = 1024,
): Record<string, WorkflowNode> {
  const isZit = styleVibe === "asian_influencer" && !!COMFYUI_ZIT_CHECKPOINT;

  const checkpoint = isZit
    ? COMFYUI_ZIT_CHECKPOINT
    : process.env.COMFYUI_CHECKPOINT ||
      "zImageTurboBaseAIO_zImageTurboFP16AIO.safetensors";

  const loras: Array<[string, number]> = isZit
    ? [[COMFYUI_ZIT_LORA, COMFYUI_ZIT_LORA_STRENGTH]]
    : [
        [
          process.env.COMFYUI_LORA ?? "",
          parseFloat(process.env.COMFYUI_LORA_STRENGTH ?? "0.7"),
        ],
        [
          process.env.COMFYUI_LORA2 ?? "",
          parseFloat(process.env.COMFYUI_LORA2_STRENGTH ?? "0.6"),
        ],
        [
          process.env.COMFYUI_LORA3 ?? "",
          parseFloat(process.env.COMFYUI_LORA3_STRENGTH ?? "0.5"),
        ],
      ];

  const steps = isZit ? 8 : 30;
  const cfg = isZit ? 1.0 : 4.0;
  const samplerName = isZit ? "euler_ancestral" : "euler";
  const scheduler = isZit ? "simple" : "normal";

  const workflow: Record<string, WorkflowNode> = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: checkpoint },
    },
  };

  // LoRA chain
  let prevModel: [string, number] = ["1", 0];
  let prevClip: [string, number] = ["1", 1];
  let nodeId = 2;
  for (const [loraName, loraStr] of loras) {
    if (!loraName) continue;
    const nid = String(nodeId);
    workflow[nid] = {
      class_type: "LoraLoader",
      inputs: {
        model: prevModel,
        clip: prevClip,
        lora_name: loraName,
        strength_model: loraStr,
        strength_clip: loraStr,
      },
    };
    prevModel = [nid, 0];
    prevClip = [nid, 1];
    nodeId++;
  }

  Object.assign(workflow, {
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { clip: prevClip, text: positivePrompt },
    },
    "6": { class_type: "CLIPTextEncode", inputs: { clip: prevClip, text: "" } },
    "7": {
      class_type: "EmptyLatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        model: prevModel,
        positive: ["5", 0],
        negative: ["6", 0],
        latent_image: ["7", 0],
        seed,
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
        denoise: 1.0,
      },
    },
    "9": {
      class_type: "VAEDecode",
      inputs: { samples: ["8", 0], vae: ["1", 2] },
    },
    "10": {
      class_type: "SaveImage",
      inputs: { images: ["9", 0], filename_prefix: "persona_candidate" },
    },
  });

  return workflow;
}

// ---------------------------------------------------------------------------
// Submit / Wait / Fetch
// ---------------------------------------------------------------------------

export async function submitWorkflow(
  workflow: Record<string, WorkflowNode>,
): Promise<string> {
  const res = await fetch(`${COMFYUI_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ComfyUI /prompt error ${res.status}: ${body}`);
  }

  const result = (await res.json()) as { prompt_id?: string };
  if (!result.prompt_id) {
    throw new Error(
      `ComfyUI /prompt returned no prompt_id: ${JSON.stringify(result)}`,
    );
  }
  return result.prompt_id;
}

export async function waitForJob(
  promptId: string,
): Promise<
  Record<
    string,
    { images?: Array<{ filename: string; subfolder?: string; type?: string }> }
  >
> {
  const historyUrl = `${COMFYUI_URL}/history/${promptId}`;
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(historyUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const hist = (await res.json()) as Record<
        string,
        {
          outputs?: Record<
            string,
            {
              images?: Array<{
                filename: string;
                subfolder?: string;
                type?: string;
              }>;
            }
          >;
        }
      >;
      if (hist[promptId]) {
        return hist[promptId].outputs ?? {};
      }
    } catch {
      // retry
    }
  }
  throw new Error(`ComfyUI job ${promptId} timed out after 120s`);
}

export async function fetchImage(
  outputs: Record<
    string,
    { images?: Array<{ filename: string; subfolder?: string; type?: string }> }
  >,
  promptId: string,
): Promise<Buffer> {
  for (const nodeOut of Object.values(outputs)) {
    const images = nodeOut.images ?? [];
    if (images.length > 0) {
      const img = images[0];
      const qs = `filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder ?? "")}&type=${encodeURIComponent(img.type ?? "output")}`;
      const res = await fetch(`${COMFYUI_URL}/view?${qs}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`ComfyUI /view error ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    }
  }
  throw new Error(`ComfyUI job ${promptId} finished but no images in output`);
}

// ---------------------------------------------------------------------------
// High-level: generate candidates via ComfyUI
// ---------------------------------------------------------------------------

export type ComfyuiCandidate = {
  image_b64: string;
  face_seed: number;
  face_prompt: string;
  model: string;
  lora: string | null;
};

export async function generateComfyuiCandidates(
  prompts: Array<{ prompt: string; seed: number }>,
  styleVibe: string,
): Promise<ComfyuiCandidate[]> {
  const isZit = styleVibe === "asian_influencer" && !!COMFYUI_ZIT_CHECKPOINT;
  const ckpt = isZit ? COMFYUI_ZIT_CHECKPOINT : COMFYUI_CHECKPOINT;

  if (!ckpt) {
    throw new Error(
      "COMFYUI_CHECKPOINT is not set. Configure it in .env.local to use ComfyUI candidate generation.",
    );
  }

  // Step 1: Submit all workflows
  const submitResults = await Promise.allSettled(
    prompts.map(({ prompt, seed }) =>
      submitWorkflow(buildComfyuiWorkflow(prompt, seed, styleVibe)),
    ),
  );

  const jobs: Array<{
    promptId: string;
    item: { prompt: string; seed: number };
  }> = [];
  for (let i = 0; i < submitResults.length; i++) {
    const r = submitResults[i];
    if (r.status === "fulfilled") {
      jobs.push({ promptId: r.value, item: prompts[i] });
    } else {
      console.error(`[ComfyUI] submit ${i} failed:`, r.reason);
    }
  }

  if (jobs.length === 0) {
    throw new Error("All ComfyUI job submissions failed");
  }

  // Step 2: Wait for all jobs
  const waitResults = await Promise.allSettled(
    jobs.map(({ promptId }) => waitForJob(promptId)),
  );

  // Step 3: Fetch images
  const candidates: ComfyuiCandidate[] = [];
  for (let i = 0; i < waitResults.length; i++) {
    const r = waitResults[i];
    if (r.status !== "fulfilled") {
      console.error(`[ComfyUI] job ${jobs[i].promptId} failed:`, r.reason);
      continue;
    }
    try {
      const pngBytes = await fetchImage(r.value, jobs[i].promptId);
      candidates.push({
        image_b64: pngBytes.toString("base64"),
        face_seed: jobs[i].item.seed,
        face_prompt: jobs[i].item.prompt,
        model: ckpt,
        lora:
          (isZit ? COMFYUI_ZIT_LORA : (process.env.COMFYUI_LORA ?? "")) || null,
      });
    } catch (e) {
      console.error(`[ComfyUI] fetch ${jobs[i].promptId} failed:`, e);
    }
  }

  if (candidates.length === 0) {
    throw new Error("All ComfyUI candidate generations failed");
  }

  return candidates;
}

/** ComfyUI 사용 가능 여부 확인 */
export function isComfyuiAvailable(): boolean {
  return !!(COMFYUI_CHECKPOINT || COMFYUI_ZIT_CHECKPOINT);
}
