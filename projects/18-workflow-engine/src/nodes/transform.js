/**
 * Pure data transformation node — map, filter, merge, extract, format.
 *
 * No side effects, no async calls beyond the transform itself.
 */

/**
 * Resolve a dotted field path from an object.
 */
function resolveField(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

/**
 * Built-in transform operations.
 */
const TRANSFORMS = {
  /** Pick specific fields from input */
  pick(input, params) {
    const result = {};
    for (const field of params.fields || []) {
      const value = resolveField(input, field);
      if (value !== undefined) {
        // Flatten dotted paths into simple keys
        const key = field.includes('.') ? field.split('.').pop() : field;
        result[key] = value;
      }
    }
    return result;
  },

  /** Merge multiple field values into one object */
  merge(input, params) {
    const result = {};
    for (const field of params.fields || []) {
      const value = resolveField(input, field);
      if (value && typeof value === 'object') {
        Object.assign(result, value);
      }
    }
    return result;
  },

  /** Format a string template */
  format(input, params) {
    let text = params.template || '';
    text = text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
      const v = resolveField(input, path);
      return v !== undefined ? String(v) : `{{${path}}}`;
    });
    return { text };
  },

  /** Map over an array field */
  map(input, params) {
    const arr = resolveField(input, params.field) || [];
    if (!Array.isArray(arr)) return { items: [] };
    const items = arr.map((item) => {
      if (params.extract) {
        return resolveField(item, params.extract);
      }
      return item;
    });
    return { items };
  },

  /** Filter an array field */
  filter(input, params) {
    const arr = resolveField(input, params.field) || [];
    if (!Array.isArray(arr)) return { items: [] };
    const items = arr.filter((item) => {
      const val = resolveField(item, params.filterField);
      return val === params.filterValue;
    });
    return { items };
  },

  /** Compose multiple fields into a summary */
  compose(input, params) {
    const parts = {};
    for (const [key, path] of Object.entries(params.mapping || {})) {
      parts[key] = resolveField(input, path);
    }
    return parts;
  },

  /** Pass through all input (identity transform) */
  passthrough(input, _params) {
    return { ...input };
  },
};

/**
 * Execute a transform node.
 *
 * Config:
 *   - operation: string — one of the built-in transforms
 *   - params: object — parameters for the transform
 *   - outputKey: string — key for result (default "transformed")
 *   - custom: function — custom transform (for programmatic use)
 */
export async function executeTransformNode(config, input) {
  const { operation, params = {}, outputKey = 'transformed', custom } = config;

  let result;

  if (custom && typeof custom === 'function') {
    result = await custom(input, params);
  } else if (operation && TRANSFORMS[operation]) {
    result = TRANSFORMS[operation](input, params);
  } else {
    throw new Error(`Unknown transform operation: ${operation}. Available: ${Object.keys(TRANSFORMS).join(', ')}`);
  }

  return {
    ...input,
    [outputKey]: result,
  };
}
