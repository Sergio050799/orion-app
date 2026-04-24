import { ValidatedVehicleDTO, FuelType, TechnicalField } from "@/types/vehicle";

const randomConfidence = (min = 0.8, max = 1.0) => Math.random() * (max - min) + min;
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomElement = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function createField<T>(value: T, confidence = randomConfidence(), isCritical = false): TechnicalField<T> {
    return { value, confidence, source: "ocr", isCritical };
}

export const MockVehicleService = {
    createMockVehicle(plate: string): ValidatedVehicleDTO {
        const make = randomElement(["TOYOTA", "VW", "SEAT", "RENAULT", "BMW"]);
        const model = randomElement(["LEON", "GOLF", "COROLLA", "MEGANE", "X3"]);
        const fuel = randomElement([FuelType.Diesel, FuelType.Gasoline, FuelType.Hybrid]);
        const powerKw = randomInt(70, 150);

        return {
            id: Math.random().toString(36).substring(7),
            plate: plate.toUpperCase(),

            vin: createField(`VSSZZZ${randomInt(10000, 99999)}`, randomConfidence(0.9, 1), true),
            category: createField("TURISMO"),
            vehicleCategory: createField("M1"),
            bodyType: createField("AC (Familiar)"),
            make: createField(make),
            model: createField(model),
            variant: createField("ST 2.0 TDI"),

            fuel: createField(fuel),
            displacement: createField(1968),
            powerKw: createField(powerKw),
            powerCv: Math.round(powerKw * 1.35962),
            emissionLevel: createField("EURO 6 AP"),
            engineCode: createField("DFG"),
            co2: createField(115),

            mma: createField(2080),
            mom: createField(1465),
            mtma_mma_axle: createField(1050),
            mtma_mma_total: createField(2080),
            length: createField(4635),
            width: createField(1800),
            height: createField(1450),

            seats: createField(5),
            tires: createField("205/55 R16 91V"),
            registrationDate: createField("2019-05-14"),

            processingStatus: "completed",
            globalConfidence: 0.94,
            alerts: [],
            humanSummary: `Este ${make} ${model} es un turismo (M1) matriculado en mayo de 2019. Cuenta con un propulsor ${fuel} de 150CV y una masa máxima de 2080kg. La lectura del bastidor es correcta y no se detectan inconsistencias graves.`
        };
    }
};
