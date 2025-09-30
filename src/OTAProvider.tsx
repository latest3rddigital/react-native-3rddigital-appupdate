import React from 'react';
import { AppAlertDialog } from './AppAlertDialog';
import { AppLoader } from './AppLoader';

export const OTAProvider = ({ children }: { children?: React.ReactNode }) => (
  <>
    {children}
    <AppLoader />
    <AppAlertDialog />
  </>
);
