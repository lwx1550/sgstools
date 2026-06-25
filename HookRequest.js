;(async () => {
  if (!window.Laya || !Laya.HttpRequest) return

  const originalSend = Laya.HttpRequest.prototype.send
  const CACHE_NAME = 'game-dynamic-cache'
  const cache = await caches.open(CACHE_NAME)
  const dynamicResourcePattern =
    /\/res\/runtime\/pc\/(?:general\/(?:seat|big)\/dynamic|animate\/skinEffect(?:Big|New))\/[\d_]+\/[^/]+\.(?:json|atlas|dds)$/i

  Laya.HttpRequest.prototype.send = function (url, data = null, method = 'get', responseType = 'text', headers = null) {
    const httpInstance = this._http

    if (httpInstance) {
      delete httpInstance.status
      delete httpInstance.statusText
      delete httpInstance.response
      delete httpInstance.responseText
      delete httpInstance.readyState
      delete httpInstance.getAllResponseHeaders
      delete httpInstance.getResponseHeader
    }

    if (method.toUpperCase() !== 'GET') {
      return originalSend.call(this, url, data, method, responseType, headers)
    }

    const absoluteUrl = new URL(url, window.location.href)
    const pathname = absoluteUrl.pathname

    if (!dynamicResourcePattern.test(pathname)) {
      return originalSend.call(this, url, data, method, responseType, headers)
    }

    this._responseType = responseType
    this._url = url
    this._data = null
    ;(async () => {
      try {
        const cacheKey = absoluteUrl.origin + pathname
        let response = await cache.match(cacheKey)

        if (!response) {
          const fetchHeaders = new Headers()
          if (headers) {
            for (let i = 0; i < headers.length; i++) {
              fetchHeaders.append(headers[i++], headers[i])
            }
          }

          response = await fetch(cacheKey, { method: 'GET', headers: fetchHeaders })
          if (response.ok) {
            await cache.put(cacheKey, response.clone())
          }
        }

        if (response && response.ok) {
          let responseData
          if (responseType === 'arraybuffer') {
            responseData = await response.arrayBuffer()
          } else {
            responseData = await response.text()
          }

          const headersMap = new Map()
          response.headers.forEach((value, key) => {
            headersMap.set(key, value)
          })

          httpInstance.getAllResponseHeaders = function () {
            let headerStr = ''
            headersMap.forEach((value, key) => {
              headerStr += `${key}: ${value}\r\n`
            })
            return headerStr
          }

          httpInstance.getResponseHeader = function (headerName) {
            return headersMap.get(headerName) || null
          }

          Object.defineProperty(httpInstance, 'status', { value: response.status, writable: true, configurable: true })
          Object.defineProperty(httpInstance, 'statusText', { value: response.statusText, writable: true, configurable: true })
          Object.defineProperty(httpInstance, 'response', { value: responseData, writable: true, configurable: true })
          Object.defineProperty(httpInstance, 'responseText', {
            value: typeof responseData === 'string' ? responseData : '',
            writable: true,
            configurable: true
          })
          Object.defineProperty(httpInstance, 'readyState', { value: 4, writable: true, configurable: true })

          this.complete()

          responseData = null
          headersMap.clear()
        } else {
          this.error(`Fetch failed with status: ${response ? response.status : 'unknown'}`)
        }
      } catch (e) {
        this.error(e.message)
      }
    })()

    return
  }
})()
