export type TlsOptions = {
  certFile: string;
  keyFile: string;
};

/**
 * Loads TLS configuration from specified certificate and key files.
 * @param opts An object containing paths to the certificate and key files.
 * @returns A promise that resolves to an object with the certificate and key as strings.
 */
export async function loadTlsConfig(
  opts: TlsOptions,
): Promise<{ cert: string; key: string }> {
  const cert = await Deno.readTextFile(opts.certFile);
  const key = await Deno.readTextFile(opts.keyFile);
  return { cert, key };
}
