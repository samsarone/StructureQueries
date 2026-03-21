import { MongoClient } from "mongodb";

let mongoClient: MongoClient | undefined;
let mongoClientConnectionPromise: Promise<MongoClient> | undefined;

const DEFAULT_MONGODB_APP_NAME = "structuredqueries-server";

function readOptional(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function getMongoDbConfig() {
  const appName =
    readOptional(process.env.MONGODB_APP_NAME) ?? DEFAULT_MONGODB_APP_NAME;
  const uri = readOptional(process.env.MONGODB_URI);

  if (!uri) {
    throw new Error(
      "MONGODB_URI is not configured. Add it before using the MongoDB connector."
    );
  }

  return {
    appName,
    uri
  };
}

export function isMongoDbConfigured() {
  return Boolean(readOptional(process.env.MONGODB_URI));
}

export function getMongoClient() {
  if (!mongoClient) {
    const { appName, uri } = getMongoDbConfig();

    mongoClient = new MongoClient(uri, {
      appName
    });
  }

  return mongoClient;
}

export async function connectMongoClient() {
  const client = getMongoClient();

  mongoClientConnectionPromise ??= client.connect().catch((error) => {
    mongoClientConnectionPromise = undefined;
    throw error;
  });

  return mongoClientConnectionPromise;
}

export async function disconnectMongoClient() {
  if (mongoClient) {
    await mongoClient.close();
  }

  mongoClient = undefined;
  mongoClientConnectionPromise = undefined;
}

export const mongoDbConnector = {
  id: "mongodb",
  packageName: "mongodb",
  runtime: "sdk",
  isConfigured: isMongoDbConfigured,
  getClient: getMongoClient,
  connect: connectMongoClient,
  disconnect: disconnectMongoClient
} as const;
