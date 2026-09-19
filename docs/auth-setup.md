# Auth setup

Sign-in ships in two flavours: **email + password**, and **Google SSO**. The
code for both is done. Password sign-in works today; Google needs credentials
that can only be created in the Google Cloud and Supabase dashboards.

## 1. Google OAuth

### Google Cloud Console

1. [console.cloud.google.com](https://console.cloud.google.com) → create or pick a project.
2. **APIs & Services → OAuth consent screen** → _External_. Fill in app name,
   support email, developer email. The default `email`, `profile` and `openid`
   scopes are all we use — `profile` is what supplies the user's real name and
   avatar. While the app is in _Testing_, only accounts listed under **Test
   users** can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   _Web application_.

   | Field                         | Value                                                       |
   | ----------------------------- | ----------------------------------------------------------- |
   | Authorised JavaScript origins | `http://localhost:8080` (add your deployed origin later)    |
   | Authorised redirect URIs      | `https://pseztqdwkdykthvkxgqn.supabase.co/auth/v1/callback` |

   > **This is the single most common thing to get wrong.** The URI you register
   > with Google is **Supabase's** callback (`/auth/v1/callback` on your project
   > domain) — _not_ this app's `/auth/callback`. Google hands the code to
   > Supabase; Supabase then forwards the browser to our page. Registering the
   > app's URL here produces a `redirect_uri_mismatch` at the consent screen.

4. Copy the **Client ID** and **Client secret**.

### Supabase dashboard

> **Do not use Authentication → OAuth Server.** The names are close enough to
> be a trap, but they point in opposite directions:
>
> | Page                    | Purpose                                                                                      |
> | ----------------------- | -------------------------------------------------------------------------------------------- |
> | **OAuth Server**        | Makes _this project_ an identity provider, so **other** apps can offer "Sign in with Settle Swiftly" |
> | **Sign In / Providers** | Lets **this app** accept "Sign in with Google" ← what we want                                |
>
> Enabling the OAuth Server publishes authorize/consent endpoints we do not
> need and expects a `/oauth/consent` screen to exist in the app. If it is on,
> turn it off.

5. **Authentication → Sign In / Providers → Google** → enable, paste the client
   ID and secret, save.
6. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:8080` for local work; the deployed origin in production.

     Note the port. A fresh project defaults to `http://localhost:3000` (the
     Next.js convention), but this app is Vite and serves on **8080** — leave
     the default in place and Google sign-in completes, then dumps the user on
     a dead port.

   - **Redirect URLs** (allow-list) — add `http://localhost:8080/**`, plus your
     production origin. This is where the app's own `/auth/callback` has to be
     permitted. Supabase refuses to redirect anywhere not on this list.

That's all the wiring. The app already:

- builds the authorize URL server-side (`startGoogleOAuth`), deriving
  `redirect_to` from the incoming request origin, so dev and production need no
  code change;
- exchanges the returned `?code=` for a session in the `/auth/callback` loader,
  during SSR, so there is no signed-out flash;
- stores the real name and avatar Google returns.

## 2. Email + password

Works now, with one caveat worth knowing before you demo it.

**The built-in SMTP is rate-limited to a handful of messages per hour.** Signing
up with a fresh address returns `email rate limit exceeded` once you cross it —
which looks like a bug in the app and is not. Two ways out:

- **For local development**: _Authentication → Providers → Email_ → turn off
  **Confirm email**. Sign-ups then get a session immediately and the app skips
  straight to onboarding. The code already handles both cases — `signUpWithPassword`
  returns `confirm-email` when there is no session and the UI shows a "check your
  inbox" notice instead.
- **For production**: _Project Settings → Authentication → SMTP Settings_ →
  configure your own provider. Supabase's built-in sender is explicitly not
  intended for production traffic.

Note also that Supabase validates the email domain — addresses at reserved TLDs
like `example.test` are rejected with `Email address … is invalid`.

## 3. How the display name is decided

One column, `profiles.display_name`, populated by a database trigger the moment
an auth user is created — so it is set identically no matter which provider
someone used.

| Signed up with   | Name comes from                                             |
| ---------------- | ----------------------------------------------------------- |
| Google           | `full_name` in the provider metadata, plus `avatar_url`     |
| Email + password | derived from the address by `app.display_name_from_email()` |

Derivation drops any `+suffix`, turns `.`, `_` and `-` into spaces, strips
digits, and title-cases the result:

| Address                       | Name           |
| ----------------------------- | -------------- |
| `sayan.banerjee@workindia.in` | Sayan Banerjee |
| `priya_sharma@acme.co.in`     | Priya Sharma   |
| `john-doe@example.com`        | John Doe       |
| `sayan112207@gmail.com`       | Sayan          |
| `sayan+newsletter@gmail.com`  | Sayan          |
| `info@acme.com`               | Info           |

If stripping digits would leave nothing (`123@x.com`), it falls back to the raw
local part rather than an empty name.

## 4. Routes and guards

| Route            | Behaviour                                                       |
| ---------------- | --------------------------------------------------------------- |
| `/login`         | email + password, and _Continue with Google_                    |
| `/signup`        | same, plus the confirm-email notice                             |
| `/auth/callback` | exchanges the OAuth code, then forwards to `/app`               |
| `/onboarding`    | asks for a business name, creates the org, makes the user owner |
| `/app`           | signed-in home                                                  |

The gate order on `/app` is: **no session → `/login`**, **session but no org →
`/onboarding`**. The second check matters because every RLS policy in the schema
keys off org membership — a signed-in user without an org would otherwise land
on a page where every query legitimately returns nothing.

`/onboarding` mirrors it: already has an org → `/app`, so it cannot be
re-entered.
