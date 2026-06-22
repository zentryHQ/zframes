export class Scene {
    private readonly _url: string;
    public constructor(private _raw: Record<string, unknown>) {
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(this._raw)], { type: 'application/json' })
        );
        this._url = url;
    }

    public get url() {
        return this._url;
    }
}
