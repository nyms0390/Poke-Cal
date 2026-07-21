export function createLiveUpdater(render) {
  return (commit, context) => {
    const result = commit();
    render(context);
    return result;
  };
}
