// Bundlers replace `process.env.NODE_ENV` in consumer builds; without `process` assume development.
export const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};
