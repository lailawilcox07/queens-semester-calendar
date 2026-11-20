// Prepares uploads (shrinks photos, encodes files) and sends them to the API.
(function (root) {
  const MAX_PDF_BYTES = 8 * 1024 * 1024;
  const MAX_EDGE = 1568; // Claude reads images up to about this size; bigger only costs more.

  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = () => reject(new Error("Couldn't read that file."));
      r.readAsDataURL(blob);
    });
  }

  // Phone photos are often 4000px+ and sometimes HEIC. Redrawing on a canvas
  // shrinks them and turns them into JPEG, which the API accepts.
  async function shrinkImage(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (e) {
      throw new Error(`Couldn't open ${file.name}. Try a PNG or JPEG screenshot.`);
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.88));
    return { type: "image/jpeg", data: await toBase64(blob), name: file.name };
  }

  async function prepare(fileList, kind) {
    const files = Array.from(fileList || []);
    if (!files.length) throw new Error("No file chosen.");
    if (files.length > 4) throw new Error("Upload up to 4 files at a time.");
    const out = [];
    for (const f of files) {
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      if (isPdf) {
        if (kind === "timetable") throw new Error("Upload a screenshot of your timetable, not a PDF.");
        if (f.size > MAX_PDF_BYTES) throw new Error(`${f.name} is over 8 MB. Try a smaller version of the syllabus.`);
        out.push({ type: "application/pdf", data: await toBase64(f), name: f.name });
      } else if (/^image\//.test(f.type) || /\.(heic|heif|png|jpe?g|webp)$/i.test(f.name)) {
        out.push(await shrinkImage(f));
      } else {
        throw new Error(`${f.name} isn't a PDF or image.`);
      }
    }
    return out;
  }

  const cfg = () => root.APP_CONFIG || {};
  const enabled = () => !!(cfg().supabaseUrl && cfg().supabaseKey);

  async function send(kind, files, term) {
    const c = cfg();
    let res;
    try {
      res = await fetch(c.supabaseUrl.replace(/\/$/, "") + "/functions/v1/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: c.supabaseKey },
        body: JSON.stringify({ kind, files: files.map(({ type, data }) => ({ type, data })), termStart: term.classesStart, termEnd: term.examEnd || term.classesEnd }),
      });
    } catch (e) {
      throw new Error("Couldn't connect. Check your internet connection and try again.");
    }
    let body = {};
    try { body = await res.json(); } catch (e) {}
    if (!res.ok || !body.ok) throw new Error(body.error || "Something went wrong. Please try again.");
    return body.result;
  }

  root.Uploader = { prepare, send, enabled };
})(window);
