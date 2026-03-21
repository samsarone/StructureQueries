import mongoose from "mongoose";

let mongooseConnectionPromise: Promise<typeof mongoose> | undefined;

const DEFAULT_MONGODB_DATABASE = "structuredqueries";

function readOptional(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function getMongooseConfig() {
  const uri = readOptional(process.env.MONGODB_URI);
  const database =
    readOptional(process.env.MONGODB_DATABASE) ?? DEFAULT_MONGODB_DATABASE;
  const autoIndex = readBoolean(
    process.env.MONGOOSE_AUTO_INDEX,
    (process.env.NODE_ENV ?? "development") !== "production"
  );

  if (!uri) {
    throw new Error(
      "MONGODB_URI is not configured. Add it before using the Mongoose connector."
    );
  }

  return {
    autoIndex,
    database,
    uri
  };
}

export function isMongooseConfigured() {
  return Boolean(readOptional(process.env.MONGODB_URI));
}

export function getMongooseInstance() {
  return mongoose;
}

export async function connectMongoose() {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const { autoIndex, database, uri } = getMongooseConfig();

  mongooseConnectionPromise ??= mongoose
    .connect(uri, {
      autoIndex,
      dbName: database
    })
    .catch((error) => {
      mongooseConnectionPromise = undefined;
      throw error;
    });

  return mongooseConnectionPromise;
}

export async function disconnectMongoose() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  mongooseConnectionPromise = undefined;
}

export const mongooseConnector = {
  id: "mongoose",
  packageName: "mongoose",
  runtime: "sdk",
  isConfigured: isMongooseConfigured,
  getClient: getMongooseInstance,
  connect: connectMongoose,
  disconnect: disconnectMongoose
} as const;
