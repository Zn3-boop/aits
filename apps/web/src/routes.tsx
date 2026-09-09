/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';

const LoginPage = lazy(() => import('./pages/LoginPage'));

export const routes = {
  '/login': LoginPage,
  '/': lazy(() => import('./pages/ChatPage').then((module) => ({ default: module.ChatPage }))),
  '/chat': lazy(() => import('./pages/ChatPage').then((module) => ({ default: module.ChatPage }))),
  '/chat/:personaId': lazy(() => import('./pages/ChatPage').then((module) => ({ default: module.ChatPage }))),
  '/voice': lazy(() => import('./pages/VoicePage').then((module) => ({ default: module.VoicePage }))),
  '/live2d': lazy(() => import('./pages/Live2DPage').then((module) => ({ default: module.Live2DPage }))),
  '/persona': lazy(() => import('./pages/PersonaCenterPage').then((module) => ({ default: module.PersonaCenterPage }))),
  '/personas': lazy(() => import('./pages/PersonaCenterPage').then((module) => ({ default: module.PersonaCenterPage }))),
  '/personas/center': lazy(() => import('./pages/PersonaCenterPage').then((module) => ({ default: module.PersonaCenterPage }))),
  '/personas/:personaId': lazy(() => import('./pages/PersonaDetailPage').then((module) => ({ default: module.PersonaDetailPage }))),
  '/memory': lazy(() => import('./pages/MemoryPage').then((module) => ({ default: module.MemoryPage }))),
  '/settings': lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage }))),
  '/profile': lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage }))),
  '/interaction/:id': lazy(() => import('./pages/InteractionPage').then((module) => ({ default: module.InteractionPage }))),
  '/interaction': lazy(() => import('./pages/InteractionPage').then((module) => ({ default: module.InteractionPage }))),

};

export default routes;