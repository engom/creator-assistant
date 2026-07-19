// CloudFront Function — rewrite extensionless URIs to .html
// Runtime: cloudfront-js-2.0 (viewer-request)
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Serve directory root as index.html
    if (uri.endsWith('/')) {
        request.uri = uri + 'index.html';
    } else if (!uri.includes('.')) {
        // No file extension — rewrite to .html
        request.uri = uri + '.html';
    }

    return request;
}
