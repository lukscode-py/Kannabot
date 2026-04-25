const now = () => new Date().toISOString();

function format(scope, level, message) {
  return `[${now()}] [${scope}] [${level}] ${message}`;
}

export const logger = {
  info(scope, message) {
    console.log(format(scope, "INFO", message));
  },
  warn(scope, message) {
    console.warn(format(scope, "WARN", message));
  },
  error(scope, message, error) {
    console.error(format(scope, "ERROR", message));
    if (error) {
      console.error(error);
    }
  }
};
