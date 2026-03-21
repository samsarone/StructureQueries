import { type Model, type Schema } from "mongoose";

import {
  connectMongoose,
  disconnectMongoose,
  getMongooseInstance,
  isMongooseConfigured
} from "../connectors/mongoose.js";

export async function getMongooseConnection() {
  await connectMongoose();

  return getMongooseInstance().connection;
}

export async function defineMongooseModel<TSchema extends object>(
  name: string,
  schema: Schema<TSchema>
) {
  const connection = await getMongooseConnection();
  const existingModel = connection.models[name] as Model<TSchema> | undefined;

  if (existingModel) {
    return existingModel;
  }

  return connection.model<TSchema>(name, schema);
}

export async function pingMongoose() {
  const connection = await getMongooseConnection();

  if (!connection.db) {
    return false;
  }

  await connection.db.admin().ping();

  return true;
}

export const mongooseAdapter = {
  id: "mongoose",
  isConfigured: isMongooseConfigured,
  getClient: getMongooseInstance,
  connect: connectMongoose,
  disconnect: disconnectMongoose,
  defineModel: defineMongooseModel,
  getConnection: getMongooseConnection,
  ping: pingMongoose
} as const;
