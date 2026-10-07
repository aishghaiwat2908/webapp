export const numericDistance = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const miles = Number(value);
  return Number.isFinite(miles) && miles >= 0 ? miles : null;
};

export const formatDistance = (value) => {
  const miles = numericDistance(value);
  if (miles === null) return "N/A";
  return miles === 0 ? "0 mi" : `${miles.toFixed(1)} mi`;
};
