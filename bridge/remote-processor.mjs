import { operationRegistry } from "../shared/operations.mjs";

const failure = (message, statusCode = 503) => Object.assign(new Error(message), { statusCode });
export function remoteProcessor(env = process.env, fetchImpl = fetch) {
  let origin;
  try {
    const url = new URL(env.MATLAB_SERVICE_URL);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error();
    origin = url.origin;
  } catch {
    throw new Error(
      "MATLAB_MODE=remote requires MATLAB_SERVICE_URL to be an HTTPS origin without a path or credentials.",
    );
  }
  const token = env.MATLAB_SERVICE_TOKEN?.trim();
  if (!token || token.length < 32 || /\s/.test(token))
    throw new Error(
      "Set a private MATLAB_SERVICE_TOKEN of at least 32 characters for remote processing.",
    );
  let active = 0;
  return async (path, { method = "GET", bytes, type } = {}) => {
    if (active >= 8) throw failure("The processing service is busy. Retry shortly.", 429);
    const health = path === "/api/matlab/health";
    active++;
    try {
      const response = await fetchImpl(`${origin}${path}`, {
        method,
        body: bytes,
        headers: { Authorization: `Bearer ${token}`, ...(type ? { "Content-Type": type } : {}) },
        redirect: "error",
        signal: AbortSignal.timeout(health ? 3000 : 390000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const messages = {
          400: "The processing service rejected the request. Check the image and settings.",
          404: "The image or run expired. Upload the image again.",
          409: "The image is still processing or the run ID was already used. Retry after completion.",
          413: "The image exceeds the processing service size limit.",
          415: "Use a valid PNG or JPEG image.",
          422: "MATLAB could not process this image. Check the image and settings.",
          429: "The processing service is busy. Retry shortly.",
        };
        throw failure(
          messages[response.status] ||
            "Remote MATLAB is unavailable. The application owner must check its configuration and license.",
          messages[response.status] ? response.status : 503,
        );
      }
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw failure("The remote processing service returned an invalid response.");
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > (health ? 16384 : 256 * 1024 * 1024))
          throw failure("The processing response exceeds the supported size.");
        chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString();
      if (text.includes(token) || /gsk_[A-Za-z0-9]{12,}/.test(text))
        throw failure("The remote processing service returned an unsafe response.");
      const data = JSON.parse(text);
      if (data.processor !== "MATLAB")
        throw failure("The remote service did not identify a MATLAB processor.");
      if (health)
        return {
          processor: "MATLAB",
          status:
            data.status === "ready" ? "ready" : data.status === "starting" ? "starting" : "offline",
          detail:
            data.status === "ready"
              ? "Remote MATLAB is ready."
              : "Remote MATLAB is unavailable or starting. Processing remains disabled until it is ready.",
          operations: Array.isArray(data.operations)
            ? data.operations.filter((id) =>
                operationRegistry.operations.some((operation) => operation.id === id),
              )
            : [],
        };
      if (data.error)
        data.error = "MATLAB sequence failed. Check the image and saved steps, then retry.";
      return data;
    } catch (error) {
      if (error.statusCode) throw error;
      throw failure(
        "Cannot reach the remote MATLAB service. The application owner must check its configuration.",
      );
    } finally {
      active--;
    }
  };
}
