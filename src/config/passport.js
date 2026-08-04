import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../modules/users/user.model.js";
import { ROLES } from "./roles.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      console.log("\n========== GOOGLE CALLBACK START ==========");

      try {
        console.log("TRY START");
        console.log("Profile ID:", profile.id);
        console.log("Profile:", JSON.stringify(profile, null, 2));

        console.log("Emails:", profile.emails);
        console.log("Photos:", profile.photos);

        const email = profile.emails?.[0]?.value
          ?.toLowerCase()
          ?.trim();

        console.log("Extracted Email:", email);

        if (!email) {
          throw new Error("Google account did not return an email.");
        }

        // Print all users
        const allUsers = await User.find({});

        console.log(
          "DB Users:",
          allUsers.map((u) => ({
            id: u._id.toString(),
            email: u.email,
            role: u.role,
          }))
        );

        // Find existing user
        let user = await User.findOne({
          email: email,
        });

        console.log("Find Result:", user);

        if (!user) {
          console.log("❌ User not found. Creating NORMAL_USER...");

          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email,
            avatar: profile.photos?.[0]?.value || null,
            provider: "GOOGLE",
            role: ROLES.NORMAL_USER,
            isVerified: true,
          });

          console.log("✅ New User Created:", user._id.toString());
        } else {
          console.log("✅ Existing User Found");
          console.log("Role:", user.role);

          user.googleId = profile.id;

          if (!user.name) {
            user.name = profile.displayName;
          }

          if (!user.avatar) {
            user.avatar = profile.photos?.[0]?.value || null;
          }

          await user.save();

          console.log("✅ Existing User Updated");
        }

        console.log("Final User ID:", user._id.toString());
        console.log("Final User Email:", user.email);
        console.log("Final User Role:", user.role);
        console.log("========== GOOGLE CALLBACK END ==========\n");

        return done(null, user);
      } catch (error) {
        console.error("❌ GOOGLE LOGIN ERROR");
        console.error(error);
        console.error(error.stack);

        return done(error, null);
      }
    }
  )
);

export default passport;