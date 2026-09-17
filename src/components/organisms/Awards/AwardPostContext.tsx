'use client';

import { createContext, useContext } from 'react';

export const AwardPostContext = createContext(false);
export const useShowPostAwards = () => useContext(AwardPostContext);
