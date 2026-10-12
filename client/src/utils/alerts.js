import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

// SweetAlert2, themed for PipraTube. `toast` keeps the familiar
// toast.success / error / info / warning calls; `confirmDialog` replaces
// the browser's plain confirm() with a styled one (returns a Promise<boolean>).
export const MySwal = withReactContent(Swal);

const theme = {
  background: "#131a23",
  color: "#ffffff",
  confirmButtonColor: "#ff2d6f",
  cancelButtonColor: "#2a3442",
};

const Toast = MySwal.mixin({
  ...theme,
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  showCloseButton: true,
  didOpen: (el) => {
    el.addEventListener("mouseenter", Swal.stopTimer);
    el.addEventListener("mouseleave", Swal.resumeTimer);
  },
});

const show = (icon) => (title) => Toast.fire({ icon, title: String(title ?? "") });

export const toast = {
  success: show("success"),
  error: show("error"),
  info: show("info"),
  warning: show("warning"),
};

export const confirmDialog = async (title, { text, confirmText = "Yes", danger = true } = {}) => {
  const result = await MySwal.fire({
    ...theme,
    title,
    text,
    icon: danger ? "warning" : "question",
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancel",
    confirmButtonColor: danger ? "#e3172f" : theme.confirmButtonColor,
    reverseButtons: true,
    focusCancel: danger,
  });
  return result.isConfirmed;
};

export default toast;
