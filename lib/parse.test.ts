import { parseDayTime, parseInterval } from "./parse"

describe("parseDayTime", () => {
    test.each([
        ["M00:00", 0],
        ["M01:00", 2],
        ["M15:00", 30],
        ["T00:00", 48],
        ["T01:00", 50],
        ["U23:30", (6*24+23.5)*2],
    ])("%s -> %s", (daytime, value) => {
        expect(parseDayTime(daytime)).toEqual(value)
    })
})

describe("parseInterval", () => {
    test.each([
        ["M00:00 M00:00", [0, 0]],
        ["M00:00 M01:00", [0, 2]],
        ["M10:00 M15:00", [20, 30]],
        ["T00:00 R12:00", [48, 168]],
        // todo: is this right?
        ["U23:30 M00:00", [335, 336]],
        ["U23:30 M01:00", [335, 338]],
    ])("%s -> %s", (interval, value) => {
        expect(parseInterval(interval)).toEqual(value)
    })
})