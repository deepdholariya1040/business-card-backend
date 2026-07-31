export const getPagination = (
  page = 1,
  limit = 10
) => {
  const currentPage =
    Number(page);

  const currentLimit =
    Number(limit);

  const skip =
    (currentPage - 1) *
    currentLimit;

  return {
    page: currentPage,
    limit: currentLimit,
    skip
  };
};