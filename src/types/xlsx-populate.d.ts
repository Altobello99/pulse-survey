declare module "xlsx-populate" {
  export interface Cell {
    value(): unknown;
    value(value: unknown): Cell;
    style(name: string, value: unknown): Cell;
  }

  export interface Range {
    clear(): Range;
    value(values: unknown[][]): Range;
    style(name: string, value: unknown): Range;
  }

  export interface Row {
    hidden(value: boolean): Row;
  }

  export interface Column {
    width(value: number): Column;
    hidden(value: boolean): Column;
  }

  export interface Sheet {
    name(): string;
    name(value: string): Sheet;
    cell(address: string): Cell;
    range(address: string): Range;
    row(index: number): Row;
    column(nameOrIndex: string | number): Column;
    delete(): Workbook;
  }

  export interface Workbook {
    sheet(nameOrIndex: string | number): Sheet | undefined;
    sheets(): Sheet[];
    cloneSheet(from: Sheet, name: string, indexOrBeforeSheet?: string | number | Sheet): Sheet;
    moveSheet(sheet: Sheet | string | number | undefined, indexOrBeforeSheet?: string | number | Sheet): Workbook;
    activeSheet(sheet: Sheet | string | number): Workbook;
    outputAsync(type: "nodebuffer"): Promise<Buffer | Uint8Array | ArrayBuffer>;
  }

  const XlsxPopulate: {
    fromDataAsync(data: Buffer | Uint8Array | ArrayBuffer): Promise<Workbook>;
  };

  export default XlsxPopulate;
}
