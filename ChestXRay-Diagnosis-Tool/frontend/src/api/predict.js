/**
 * API wrapper for the ChestXRay Diagnosis backend.
 * POST /predict — multipart/form-data with a single "file" field.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/**
 * @param {File} imageFile
 * @returns {Promise<{
 *   disease: string,
 *   probability: number,
 *   positive: boolean,
 *   heatmap_base64: string,
 *   grayscale_map: number[][],
 *   report: string,
 * }>}
 */
export async function predictXRay(imageFile) {
  const form = new FormData();
  form.append("file", imageFile);

  const res = await fetch(`${BASE_URL}/predict`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail?.detail ?? "Prediction failed.");
  }

  return res.json();
}
