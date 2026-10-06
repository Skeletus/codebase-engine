import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { buildDataset, datasetHash, verifySplits } from "./laya-dataset.ts";
import { train } from "./laya-training.ts";
import { LAYA_ARTIFACT } from "../lib/laya/artifact.ts";

globalThis.fetch = async () => { throw new Error("Reproduction egress denied"); };
const data = await buildDataset(); verifySplits(data);
const recorded = JSON.parse(readFileSync(new URL("../artifacts/laya-nav-1/training.json", import.meta.url), "utf8"));
assert.equal(datasetHash(data), recorded.datasetHash);
const trained = await train(data, datasetHash(data));
const modelHash = createHash("sha256").update(JSON.stringify(trained.model)).digest("hex");
assert.equal(modelHash, LAYA_ARTIFACT.hash);
assert.equal(trained.trainingTraceHash, recorded.trainingTraceHash);
assert.equal(trained.bestEpoch, recorded.bestEpoch);
assert.deepEqual(trained.configuration, recorded.configuration);
console.log(JSON.stringify({ reproduced: true, datasetHash: datasetHash(data), modelHash, trainingTraceHash: trained.trainingTraceHash, node: process.version }));
