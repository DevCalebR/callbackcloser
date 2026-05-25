export const PUBLIC_CREATE_ACCOUNT_PATH = '/sign-up?intent=create-account';
export const PUBLIC_START_FREE_PILOT_PATH = '/start-free-pilot';
export const PUBLIC_SIGN_IN_PATH = '/sign-in';
export const OWNER_DASHBOARD_PATH = '/app';
export const OWNER_ONBOARDING_PATH = '/app/onboarding?source=public-sign-up';
export const ADMIN_NEW_BUSINESS_PILOT_PATH = '/admin?intent=new-business-pilot';

type SignedInRoutingState = {
  hasBusiness: boolean;
  isAdmin: boolean;
};

type PublicPilotRoutingState = SignedInRoutingState & {
  isAuthenticated: boolean;
};

export function resolveSignedInAppDestination(state: SignedInRoutingState) {
  if (state.isAdmin) {
    return ADMIN_NEW_BUSINESS_PILOT_PATH;
  }

  if (state.hasBusiness) {
    return OWNER_DASHBOARD_PATH;
  }

  return OWNER_ONBOARDING_PATH;
}

export function resolvePublicPilotDestination(state: PublicPilotRoutingState) {
  if (!state.isAuthenticated) {
    return '/sign-up?intent=pilot';
  }

  return resolveSignedInAppDestination(state);
}
