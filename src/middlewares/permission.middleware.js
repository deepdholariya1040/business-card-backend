const permissionMiddleware =
  (permission) =>
  (req, res, next) => {
    const permissions =
      req.user.permissions ||
      [];

    if (
      !permissions.includes(
        permission
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "Permission denied."
      });
    }

    next();
  };

export default permissionMiddleware;