export const expectInteger = (n: number, error: string): number => {
    if (n !== Math.round(n)) {
        throw new Error(error ?? 'Not an integer')
    }
    return n;
}
