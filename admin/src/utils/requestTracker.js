// Counts requests in flight for the top loading bar (components/TopProgress.jsx).

let pending = 0;
const listeners = new Set();
const emit = () => listeners.forEach((notify) => notify());
export const subscribe = (notify) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};
export const snapshot = () => pending;

// Counts an axios instance's requests in and out (uploads included — their
// own progress modal shows the detail; the bar just says "busy").
export const trackRequests = (client) => {
  client.interceptors.request.use((config) => {
    pending += 1;
    emit();
    return config;
  });
  const done = () => {
    pending = Math.max(0, pending - 1);
    emit();
  };
  client.interceptors.response.use(
    (response) => {
      done();
      return response;
    },
    (error) => {
      done();
      return Promise.reject(error);
    },
  );
};
