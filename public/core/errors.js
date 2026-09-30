/** An error that knows its HTTP status. Anything else thrown is a 500. Shared by the server and the standalone app. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
