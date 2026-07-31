import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import User from "../modules/users/user.model.js";
import { ROLES } from "./roles.js";

passport.use(
  new GoogleStrategy(
    {
      clientID:
        process.env.GOOGLE_CLIENT_ID,
      clientSecret:
        process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL
    },
    async (
      accessToken,
      refreshToken,
      profile,
      done
    ) => {
      try {
        const email =
          profile.emails?.[0]?.value;

        let user =
          await User.findOne({
            email
          });

        if (!user) {
          user = await User.create({
            googleId: profile.id,
            name:
              profile.displayName,
            email,
            avatar:
              profile.photos?.[0]
                ?.value,
            role:
              ROLES.NORMAL_USER
          });
        }

        user.googleId =
          profile.id;

        await user.save();

        return done(
          null,
          user
        );
      } catch (error) {
        return done(
          error,
          null
        );
      }
    }
  )
);

export default passport;