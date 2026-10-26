export type ConversionResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string;
  body: Blob;
};

/** a blob's text (FileReader: also where Blob#text is missing) */
export const blobText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

/**
 * POST a PDF to the converter with XMLHttpRequest, which (unlike fetch)
 * reports how much of the upload has been sent.
 */
export const uploadForConversion = (
  url: string,
  file: File,
  on: { progress: (percent: number) => void; uploaded: () => void },
) => {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<ConversionResponse>((resolve, reject) => {
    xhr.open("POST", url);
    xhr.responseType = "blob";
    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (event.lengthComputable && event.total > 0) {
        on.progress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.upload.onload = () => on.uploaded();
    xhr.onload = () =>
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        statusText: xhr.statusText,
        contentType: xhr.getResponseHeader("content-type") || "",
        body:
          xhr.response instanceof Blob
            ? xhr.response
            : new Blob([xhr.response ?? ""]),
      });
    xhr.onerror = () =>
      reject(new Error("The PDF converter could not be reached"));
    xhr.onabort = () =>
      reject(
        Object.assign(new Error("Import cancelled"), { name: "AbortError" }),
      );
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
};
