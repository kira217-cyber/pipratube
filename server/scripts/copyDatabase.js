// Copies every collection from one MongoDB database to another (e.g. the
// local development database to the production one). Refuses to write into
// a target that already has data, so it can never overwrite a live site.
//
//   node scripts/copyDatabase.js <sourceUri> <targetUri>
import mongoose from "mongoose";

const [sourceUri, targetUri] = process.argv.slice(2);
if (!sourceUri || !targetUri) {
  console.error("Usage: node scripts/copyDatabase.js <sourceUri> <targetUri>");
  process.exit(1);
}

const run = async () => {
  const source = await mongoose.createConnection(sourceUri).asPromise();
  const target = await mongoose.createConnection(targetUri, { serverSelectionTimeoutMS: 20000 }).asPromise();

  const existing = await target.db.listCollections().toArray();
  for (const { name } of existing) {
    if ((await target.db.collection(name).estimatedDocumentCount()) > 0) {
      throw new Error(`Target already has data in "${name}" — not copying over it.`);
    }
  }

  const collections = await source.db.listCollections({ type: "collection" }).toArray();
  for (const { name } of collections) {
    const docs = await source.db.collection(name).find().toArray();
    if (docs.length) {
      for (let i = 0; i < docs.length; i += 500) await target.db.collection(name).insertMany(docs.slice(i, i + 500), { ordered: true });
    }
    // Same indexes (unique handles, emails…) as the source.
    const indexes = (await source.db.collection(name).indexes()).filter((index) => index.name !== "_id_");
    for (const { key, name: indexName, v, ns, ...options } of indexes) {
      await target.db.collection(name).createIndex(key, { name: indexName, ...options });
    }
    const copied = await target.db.collection(name).countDocuments();
    console.log(`${name.padEnd(22)} ${String(docs.length).padStart(5)} → ${copied}${copied === docs.length ? "" : "  MISMATCH"}`);
  }

  await source.close();
  await target.close();
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
