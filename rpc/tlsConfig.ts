export type TlsOptions = {
    certFile: string;
    keyFile: string;
};

export async function loadTlsConfig(opts: TlsOptions) {
    const cert = await Deno.readTextFile(opts.certFile);
    const key = await Deno.readTextFile(opts.keyFile);
    return { cert, key };
}