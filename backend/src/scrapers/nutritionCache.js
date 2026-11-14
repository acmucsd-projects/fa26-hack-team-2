function nutritionCacheFileName(nutritionUrl) {
  const url = new URL(nutritionUrl);

  // Only accept URLs from HDH's nutrition website.
  if (
    url.protocol !== "https:" ||
    url.hostname !== "hdh-web.ucsd.edu"
  ) {
    throw new Error(
      `Unexpected nutrition website: ${nutritionUrl}`
    );
  }

  const itemId = url.searchParams.get("id");
  const recId = url.searchParams.get("recId");

  if (!/^\d+$/.test(itemId || "")) {
    throw new Error(
      `Invalid nutrition item ID: ${nutritionUrl}`
    );
  }

  // Encode special characters so filenames are safe.
  return recId
    ? `${itemId}-${encodeURIComponent(recId)}.html`
    : `${itemId}.html`;
}

module.exports = { nutritionCacheFileName };