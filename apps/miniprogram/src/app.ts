App({
  onLaunch() {
    if (__DEVELOPMENT__)
      console.info(
        "LIVERSE development build: example positions are not venue facts.",
      );
  },
});
