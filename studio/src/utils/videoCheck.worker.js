import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-wasm";
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
import wasmPlain from "@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm?url";
import wasmSimd from "@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm?url";
import wasmThreaded from "@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-threaded-simd.wasm?url";
import { load } from "nsfwjs/core";
import { MobileNetV2Model } from "nsfwjs/models/mobilenet_v2";

// The adult-content model, in its own thread: loading it and scoring
// frames never touches the page's main thread, so the upload (and the
// screen) keep running at full speed. The page sends 224×224 RGBA pixels;
// the worker answers with nsfwjs scores in percent.

setWasmPaths({ "tfjs-backend-wasm.wasm": wasmPlain, "tfjs-backend-wasm-simd.wasm": wasmSimd, "tfjs-backend-wasm-threaded-simd.wasm": wasmThreaded });

const SIZE = 224;
let modelPromise = null;

const pickBackend = async () => {
  for (const name of ["webgl", "wasm", "cpu"]) {
    try {
      if (await tf.setBackend(name)) {
        await tf.ready();
        return name;
      }
    } catch {
      // try the next one
    }
  }
  return tf.getBackend();
};

const getModel = () => {
  if (!modelPromise) {
    modelPromise = (async () => {
      await pickBackend();
      return load("MobileNetV2", { modelDefinitions: [MobileNetV2Model] });
    })();
  }
  return modelPromise;
};

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === "load") {
      await getModel();
      self.postMessage({ id, ok: true, backend: tf.getBackend() });
      return;
    }
    if (type === "classify") {
      const model = await getModel();
      const rgba = new Uint8ClampedArray(data.pixels);
      const rgb = new Int32Array(SIZE * SIZE * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        rgb[j] = rgba[i];
        rgb[j + 1] = rgba[i + 1];
        rgb[j + 2] = rgba[i + 2];
      }
      const image = tf.tensor3d(rgb, [SIZE, SIZE, 3], "int32");
      try {
        const predictions = await model.classify(image);
        const scores = { Porn: 0, Sexy: 0, Hentai: 0, Neutral: 0, Drawing: 0 };
        predictions.forEach((p) => {
          scores[p.className] = Math.round(p.probability * 1000) / 10;
        });
        self.postMessage({ id, ok: true, scores });
      } finally {
        image.dispose();
      }
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || error) });
  }
};
