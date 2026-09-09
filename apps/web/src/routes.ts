import type { ComponentType } from 'react';
import { PersonaDetailPage } from './pages/PersonaDetailPage';
import { PersonaCenterPage } from './pages/PersonaCenterPage';
import { Live2DPage } from './pages/Live2DPage';

export const routes: Record<string, ComponentType> = {
  '/personas': PersonaCenterPage,
  '/personas/:id': PersonaDetailPage,
  '/live2d': Live2DPage
};
