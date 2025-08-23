# BooksApi

All URIs are relative to *http://localhost*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**coverPresign**](#coverpresign) | **POST** /api/books/cover/update | Prepare book cover upload|
|[**createBookAndPresign**](#createbookandpresign) | **POST** /api/books/presign | Create book record and get presigned upload URLs|
|[**downloadBook**](#downloadbook) | **GET** /api/books/{id}/download | Download book file|
|[**finalizeBook**](#finalizebook) | **POST** /api/books/finalize | Finalize book upload|
|[**finalizeCover**](#finalizecover) | **POST** /api/books/cover/finalize | Finalize cover upload|
|[**getAllBooks**](#getallbooks) | **GET** /api/books | Get all user books|
|[**getBook**](#getbook) | **GET** /api/books/{id} | Get book by ID|
|[**setLastAccessed**](#setlastaccessed) | **POST** /api/books/{id} | Set last accessed file date|
|[**updateCoverFinalize**](#updatecoverfinalize) | **POST** /api/books/cover/update/finalize | Finalize book cover upload|

# **coverPresign**
> CoverPresignResponse coverPresign(presignedUploadDto)

Prepares the book cover for upload, returning necessary metadata and presigned URL

### Example

```typescript
import {
    BooksApi,
    Configuration,
    PresignedUploadDto
} from './api';

const configuration = new Configuration();
const apiInstance = new BooksApi(configuration);

let presignedUploadDto: PresignedUploadDto; //

const { status, data } = await apiInstance.coverPresign(
    presignedUploadDto
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **presignedUploadDto** | **PresignedUploadDto**|  | |


### Return type

**CoverPresignResponse**

### Authorization

[bearer](../README.md#bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** |  |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **createBookAndPresign**
> PresignResponse createBookAndPresign(createBookDto)

Creates a new book record and returns presigned URLs for uploading both the book file and optional custom cover

### Example

```typescript
import {
    BooksApi,
    Configuration,
    CreateBookDto
} from './api';

const configuration = new Configuration();
const apiInstance = new BooksApi(configuration);

let createBookDto: CreateBookDto; //

const { status, data } = await apiInstance.createBookAndPresign(
    createBookDto
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createBookDto** | **CreateBookDto**|  | |


### Return type

**PresignResponse**

### Authorization

[bearer](../README.md#bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Book created successfully |  -  |
|**400** | Invalid input data |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **downloadBook**
> downloadBook()

Downloads the book file with support for HTTP Range requests (partial downloads)

### Example

```typescript
import {
    BooksApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BooksApi(configuration);

let id: string; //Book ID (default to undefined)
let range: string; //HTTP Range header for partial downloads (optional) (default to undefined)

const { status, data } = await apiInstance.downloadBook(
    id,
    range
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] | Book ID | defaults to undefined|
| **range** | [**string**] | HTTP Range header for partial downloads | (optional) defaults to undefined|


### Return type

void (empty response body)

### Authorization

[bearer](../README.md#bearer)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Book file download started |  -  |
|**206** | Partial content (Range request) |  -  |
|**401** | Unauthorized |  -  |
|**404** | Book not found or not ready |  -  |
|**416** | Range not satisfiable |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **finalizeBook**
> FinalizeResponse finalizeBook(finalizeBookDto)

Verifies uploaded files, calculates hash, and marks book as ready

### Example

```typescript
import {
    BooksApi,
    Configuration,
    FinalizeBookDto
} from './api';

const configuration = new Configuration();
const apiInstance = new BooksApi(configuration);

let finalizeBookDto: FinalizeBookDto; //

const { status, data } = await apiInstance.finalizeBook(
    finalizeBookDto
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **finalizeBookDto** | **FinalizeBookDto**|  | |


### Return type

**FinalizeResponse**

### Authorization

[bearer](../README.md#bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Book finalized successfully |  -  |
|**400** | File validation failed |  -  |
|**401** | Unauthorized |  -  |
|**404** | Book not found or already finalized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **finalizeCover**
> finalizeCover(finalizeCoverDto)

Verifies the uploaded cover file and links it to the book

### Example

```typescript
import {
    BooksApi,
    Configuration,
    FinalizeCoverDto
} from './api';

const configuration = new Configuration();
const apiInstance = new BooksApi(configuration);

let finalizeCoverDto: FinalizeCoverDto; //

const { status, data } = await apiInstance.finalizeCover(
    finalizeCoverDto
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **finalizeCoverDto** | **FinalizeCoverDto**|  | |


### Return type

void (empty response body)

### Authorization

[bearer](../README.md#bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Cover finalized successfully |  -  |
|**400** | Cover file not found in storage |  -  |
|**401** | Unauthorized |  -  |
|**404** | Book not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getAllBooks**
> Array<BookResponse> getAllBooks()

Retrieves all books for the authenticated user (excludes pending and error statuses)

### Example

```typescript
import {
    BooksApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BooksApi(configuration);

const { status, data } = await apiInstance.getAllBooks();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**Array<BookResponse>**

### Authorization

[bearer](../README.md#bearer)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Books retrieved successfully |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getBook**
> BookResponse getBook()

Retrieves detailed information about a specific book

### Example

```typescript
import {
    BooksApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BooksApi(configuration);

let id: string; //Book ID (default to undefined)

const { status, data } = await apiInstance.getBook(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] | Book ID | defaults to undefined|


### Return type

**BookResponse**

### Authorization

[bearer](../README.md#bearer)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Book retrieved successfully |  -  |
|**401** | Unauthorized |  -  |
|**404** | Book not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **setLastAccessed**
> UpdateLastAccessedResponse setLastAccessed(updateLastAccessedDto)


### Example

```typescript
import {
    BooksApi,
    Configuration,
    UpdateLastAccessedDto
} from './api';

const configuration = new Configuration();
const apiInstance = new BooksApi(configuration);

let updateLastAccessedDto: UpdateLastAccessedDto; //

const { status, data } = await apiInstance.setLastAccessed(
    updateLastAccessedDto
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateLastAccessedDto** | **UpdateLastAccessedDto**|  | |


### Return type

**UpdateLastAccessedResponse**

### Authorization

[bearer](../README.md#bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** |  |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **updateCoverFinalize**
> FinalizeResponse updateCoverFinalize(coverUpdateDto)

Finalizes the book cover upload, returning necessary metadata and presigned URL

### Example

```typescript
import {
    BooksApi,
    Configuration,
    CoverUpdateDto
} from './api';

const configuration = new Configuration();
const apiInstance = new BooksApi(configuration);

let coverUpdateDto: CoverUpdateDto; //

const { status, data } = await apiInstance.updateCoverFinalize(
    coverUpdateDto
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **coverUpdateDto** | **CoverUpdateDto**|  | |


### Return type

**FinalizeResponse**

### Authorization

[bearer](../README.md#bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** |  |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

