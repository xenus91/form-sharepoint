// src/AppWithOverlay.jsx
//
// Композиция экрана: приложение ВСЕГДА смонтировано, а связанный элемент
// (?ID=<Id> из RelatedItems задачи) рисуется поверх него.
//
// Раньше в main.tsx стояло `hasIdParam() ? <ItemViewer/> : <App/>`: адрес ?ID=
// выключал приложение целиком, список задач размонтировался, а при возврате
// загружался заново. Здесь приложение живёт непрерывно.
import App from "./App.jsx";
import RelatedItemOverlay from "./RelatedItemOverlay.jsx";

export default function AppWithOverlay() {
  return (
    <>
      <App />
      <RelatedItemOverlay />
    </>
  );
}
