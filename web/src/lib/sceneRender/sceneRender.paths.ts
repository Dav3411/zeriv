/**
 * sceneRender.paths.ts — Scene render job R2 에셋 경로 빌더.
 *
 * 경로 컨벤션: scene-renders/{sceneJobId}/{stage}/{file}
 */

const R2_BUCKET = process.env.R2_BUCKET ?? "";

function r2Path(sceneJobId: string, stage: string, file: string): string {
  if (R2_BUCKET) {
    return `${R2_BUCKET}/scene-renders/${sceneJobId}/${stage}/${file}`;
  }
  return `scene-renders/${sceneJobId}/${stage}/${file}`;
}

export interface SceneAssetPaths {
  // Body / Face
  bodyPass: string;
  bodyReport: string;
  facePass: string;
  faceReport: string;
  // Fusion
  fusedCharacter: string;
  fusionReport: string;
  // Matting
  foregroundAlpha: string;
  foregroundPreview: string;
  mattingReport: string;
  // Composition
  draftComposite: string;
  compositionReport: string;
  // Ad-specific overlays
  textOverlay: string;
  textOverlayReport: string;
  productComposite: string;
  productCompositeReport: string;
  // Polish
  polishedMaster: string;
  polishReport: string;
  // Final
  finalScene: string;
  thumbnail: string;
  previewClip: string;
  sceneMetadata: string;
  // Job-level snapshot
  jobSnapshot: string;
}

export function buildSceneAssetPaths(sceneJobId: string): SceneAssetPaths {
  return {
    bodyPass:    r2Path(sceneJobId, "generation", "body_pass.mp4"),
    bodyReport:  r2Path(sceneJobId, "generation", "body_pass_report.json"),
    facePass:    r2Path(sceneJobId, "generation", "face_pass.mp4"),
    faceReport:  r2Path(sceneJobId, "generation", "face_pass_report.json"),

    fusedCharacter: r2Path(sceneJobId, "fusion", "fused_character.mp4"),
    fusionReport:   r2Path(sceneJobId, "fusion", "fusion_report.json"),

    foregroundAlpha:   r2Path(sceneJobId, "matting", "foreground_alpha.mov"),
    foregroundPreview: r2Path(sceneJobId, "matting", "foreground_preview.mp4"),
    mattingReport:     r2Path(sceneJobId, "matting", "matting_report.json"),

    draftComposite:    r2Path(sceneJobId, "composition", "draft_composite.mp4"),
    compositionReport: r2Path(sceneJobId, "composition", "composition_report.json"),

    textOverlay:       r2Path(sceneJobId, "overlay", "text_overlay.mp4"),
    textOverlayReport: r2Path(sceneJobId, "overlay", "text_overlay_report.json"),

    productComposite:       r2Path(sceneJobId, "overlay", "product_composite.mp4"),
    productCompositeReport: r2Path(sceneJobId, "overlay", "product_composite_report.json"),

    polishedMaster: r2Path(sceneJobId, "polish", "polished_master.mp4"),
    polishReport:   r2Path(sceneJobId, "polish", "polish_report.json"),

    finalScene:    r2Path(sceneJobId, "final", "final_scene.mp4"),
    thumbnail:     r2Path(sceneJobId, "final", "thumbnail.jpg"),
    previewClip:   r2Path(sceneJobId, "final", "preview_clip.mp4"),
    sceneMetadata: r2Path(sceneJobId, "final", "scene_metadata.json"),

    jobSnapshot: r2Path(sceneJobId, "meta", "job_snapshot.json"),
  };
}
