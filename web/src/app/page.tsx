/* eslint-disable @next/next/no-img-element */

import LandingPage from "./LandingPage";
import { AuthRedirect } from "./AuthRedirect";

export default function Page() {
  return (
    <AuthRedirect>
      <LandingPage />
    </AuthRedirect>
  );
}
