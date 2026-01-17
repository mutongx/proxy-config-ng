export function orDefault<T>(value: T | undefined, defaultValue: T) {
  if (value === undefined) {
    return defaultValue;
  }
  return value;
}

export function ensureArray(value: string | string[] | null | undefined) {
  if (typeof value === "string") {
    value = [value];
  }
  if (!Array.isArray(value)) {
    value = [];
  }
  return value;
}

export function parseConfigString(str: string | null) {
  // The behavior mimics Linux kernel's command-line parameters,
  // see https://docs.kernel.org/admin-guide/kernel-parameters.html
  const result: any = {};
  if (str === null) {
    return result;
  }
  let state: "sep" | "key" | "value" | "value-quote" = "sep";
  let quote: '"' | "'" | null = null;
  let currentKey: string = "";
  let currentValue: string = "";
  for (let i = 0; i <= str.length; ++i) {
    const ch = i < str.length ? str[i] : " ";
    switch (state) {
      case "sep":
        switch (ch) {
          case "=":
            throw new Error("key cannot contain equal sign");
          case " ":
            break;
          default:
            state = "key";
            currentKey = ch;
            break;
        }
        break;
      case "key":
        switch (ch) {
          case "=":
            state = "value";
            currentValue = "";
            break;
          case " ":
            throw new Error("key cannot contain spaces");
          default:
            currentKey += ch;
            break;
        }
        break;
      case "value":
        switch (ch) {
          case " ":
            state = "sep";
            try {
              result[currentKey] = JSON.parse(currentValue);
            } catch (e) {
              if (currentValue.includes(",")) {
                result[currentKey] = currentValue.split(",");
              } else {
                result[currentKey] = currentValue;
              }
            }
            break;
          case '"':
          case "'":
            state = "value-quote";
            quote = ch;
            break;
          default:
            currentValue += ch;
        }
        break;
      case "value-quote":
        switch (ch) {
          case '"':
          case "'":
            if (ch == quote) {
              state = "value";
              quote = null;
            } else {
              currentValue += ch;
            }
            break;
          default:
            currentValue += ch;
        }
        break;
      default:
        throw new Error("unreachable code");
    }
  }
  return result;
}
