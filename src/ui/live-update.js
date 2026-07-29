export function createLiveUpdater(render) {
  return (commit, context) => {
    const result = commit();
    render(context);
    return result;
  };
}

export function createDeferredUpdater(initialValue, commit) {
  let value = initialValue;
  let dirty = false;

  return {
    stage(update) {
      value = update(value);
      dirty = true;
      return value;
    },
    current() {
      return value;
    },
    apply() {
      if (!dirty) return false;
      commit(value);
      dirty = false;
      return true;
    },
  };
}
