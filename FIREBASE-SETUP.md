# AeroCrash Firebase setup

## What was fixed
- Firebase Auth login no longer auto-creates an account after `auth/invalid-credential`.
- Wrong/invalid credentials now remain a normal login failure.
- Firestore permission errors no longer invalidate an already authenticated Firebase session.
- User profile reads/writes are scoped to `users/{uid}`.
- `login_logs` and `payment_logs` are best-effort audit writes and cannot break login.
- Realtime profile listener stops cleanly when Firestore denies access.
- Added Firestore rules for the collections currently used by the frontend.
- Added a favicon so the browser no longer requests a missing `/favicon.ico`.

## Deploy Firestore rules
In the Firebase project `aviator-66312`, deploy `firestore.rules` from the Firebase CLI:

```bash
firebase login
firebase use aviator-66312
firebase deploy --only firestore:rules
```

If this project is not initialized locally, run `firebase init firestore` first and choose the existing `aviator-66312` project. Keep the generated `firestore.rules` as this file.

## Admin authorization
The current frontend admin allow-list contains:

`carrentpedatabase@gmail.com`

The Firestore rules also recognize that verified Firebase Auth email as the Game Master account. For production, consider moving role authorization to Firebase custom claims/backend authorization rather than relying only on frontend email checks.

## Important prototype note
The wallet/balance is still a client-side virtual-money prototype. Do not treat browser-written `balance` or `payment_logs` as trusted financial records. A production money system needs server-side authoritative wallet mutations and transaction validation.
