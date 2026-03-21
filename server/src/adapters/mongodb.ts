import {
  type Document
} from "mongodb";

import {
  connectMongoClient,
  disconnectMongoClient,
  getMongoClient,
  isMongoDbConfigured
} from "../connectors/mongodb.js";

const DEFAULT_MONGODB_DATABASE = "structuredqueries";

function getMongoDatabaseName() {
  const trimmed = process.env.MONGODB_DATABASE?.trim();

  return trimmed || DEFAULT_MONGODB_DATABASE;
}

export async function getMongoDatabase(databaseName = getMongoDatabaseName()) {
  const client = await connectMongoClient();

  return client.db(databaseName);
}

export async function getMongoCollection<TSchema extends Document = Document>(
  collectionName: string,
  databaseName = getMongoDatabaseName()
) {
  const database = await getMongoDatabase(databaseName);

  return database.collection<TSchema>(collectionName);
}

export async function pingMongoDatabase(
  databaseName = getMongoDatabaseName()
) {
  const database = await getMongoDatabase(databaseName);

  await database.command({
    ping: 1
  });

  return true;
}

export const mongoDbAdapter = {
  id: "mongodb",
  isConfigured: isMongoDbConfigured,
  getClient: getMongoClient,
  connect: connectMongoClient,
  disconnect: disconnectMongoClient,
  getCollection: getMongoCollection,
  getDatabase: getMongoDatabase,
  ping: pingMongoDatabase
} as const;
