<?php

namespace App\Services\Account\Photo;

use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use App\Models\Account\Photo;
use App\Services\BaseService;
use function Safe\finfo_open;
use function Safe\preg_match;
use App\Helpers\StorageHelper;
use App\Models\Contact\Contact;
use function Safe\base64_decode;
use Intervention\Image\Facades\Image;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use League\Flysystem\UnableToReadFile;
use Intervention\Image\Exception\NotReadableException;

class UploadPhoto extends BaseService
{
    public function __construct()
    {
        Validator::extend('photo', function ($attribute, $value, $parameters, $validator) {
            return $this->isValidPhoto($value);
        });
    }

    /**
     * Get the validation rules that apply to the service.
     *
     * @return array
     */
    public function rules()
    {
        return [
            'account_id' => 'required|integer|exists:accounts,id',
            'contact_id' => 'required|integer|exists:contacts,id',
            'photo' => 'required_without:data|file|image',
            'data' => 'required_without:photo|string|photo',
            'extension' => 'nullable|string',
        ];
    }

    /**
     * Upload a photo.
     *
     * @param  array  $data
     * @param  bool  $reuseExisting  Reuse identical images when the caller holds a contact lock.
     * @return Photo|null
     */
    public function execute(array $data, bool $reuseExisting = false): ?Photo
    {
        $this->validate($data);

        $contact = Contact::where('account_id', $data['account_id'])
            ->findOrFail($data['contact_id']);

        $contact->throwInactive();

        $array = null;
        if (Arr::has($data, 'photo')) {
            $array = $this->importPhoto($data);
        } else {
            $array = $this->importFile($data, $reuseExisting ? $contact : null);
        }

        if ($array instanceof Photo) {
            return $array;
        }
        if (! $array) {
            return null;
        }

        try {
            $photo = Photo::create($array);
            $contact->photos()->syncWithoutDetaching([$photo->id]);

            return $photo;
        } catch (\Throwable $exception) {
            if ($reuseExisting) {
                Storage::delete($array['new_filename']);
            }
            throw $exception;
        }
    }

    /**
     * Create an array with the necessary fields to create the photo object.
     *
     * @return array
     */
    private function importPhoto($data): array
    {
        $photo = $data['photo'];

        return [
            'account_id' => $data['account_id'],
            'original_filename' => $photo->getClientOriginalName(),
            'filesize' => $photo->getSize(),
            'mime_type' => (new \Mimey\MimeTypes)->getMimeType($photo->guessClientExtension()),
            'new_filename' => $photo->store('photos', [
                'disk' => config('filesystems.default'),
                'visibility' => config('filesystems.default_visibility'),
            ]),
        ];
    }

    /**
     * Upload the photo.
     *
     * @return array|Photo|null
     */
    private function importFile(array $data, ?Contact $reuseFor = null): array|Photo|null
    {
        $filename = Str::random(40);

        try {
            $image = Image::make($data['data']);
        } catch (NotReadableException $e) {
            return null;
        }

        $tempfile = $this->storeImage('local', $image, 'temp/'.$filename);
        if ($tempfile === null) {
            return null;
        }

        try {
            $storagePath = StorageHelper::disk('local')->path($tempfile);
            // This sets the basePath to get the filesize later
            $image = $image->setFileInfoFromPath($storagePath);
            if ($reuseFor && ($existing = $this->findMatchingPhoto($reuseFor, $storagePath, $image->filesize()))) {
                return $existing;
            }
            $extension = (new \Mimey\MimeTypes)->getExtension($image->mime());
            if (empty($extension)) {
                $extension = str_replace(' ', '', Arr::get($data, 'extension') ?? '');
            }
            if (! empty($extension)) {
                $filename .= '.'.$extension;
            }

            $array = [
                'account_id' => $data['account_id'],
                'original_filename' => $filename,
                'filesize' => $image->filesize(),
                'mime_type' => $image->mime(),
            ];

            $array['new_filename'] = $this->storeImage(config('filesystems.default'), $image, 'photos/'.$filename);
            if ($array['new_filename'] === null) {
                return null;
            }
        } finally {
            $storage = Storage::disk('local');
            if ($storage->exists($tempfile)) {
                $storage->delete($tempfile);
            }
        }

        return $array;
    }

    private function findMatchingPhoto(Contact $contact, string $path, int $size): ?Photo
    {
        $hash = hash_file('sha256', $path);
        $disk = Storage::disk(config('filesystems.default'));
        $candidates = $contact->photos()->where('photos.filesize', $size)->orderBy('photos.id')->get();

        foreach ($candidates as $candidate) {
            try {
                $stream = $disk->readStream($candidate->new_filename);
            } catch (UnableToReadFile $exception) {
                if ($disk->missing($candidate->new_filename)) {
                    continue;
                }
                throw $exception;
            }
            if (! is_resource($stream)) {
                continue;
            }
            try {
                $context = hash_init('sha256');
                hash_update_stream($context, $stream);
                if ($hash === hash_final($context)) {
                    return $candidate;
                }
            } finally {
                fclose($stream);
            }
        }

        return null;
    }

    /**
     * Store the decoded image in the temp file.
     *
     * @param  string  $disk
     * @param  \Intervention\Image\Image  $image
     * @param  string  $filename
     * @return string|null
     */
    private function storeImage(string $disk, $image, string $filename): ?string
    {
        $result = Storage::disk($disk)
            ->put($path = $filename, (string) $image->stream(), config('filesystems.default_visibility'));

        return $result ? $path : null;
    }

    /**
     * Determines if the source photo is a valid encoded photo.
     *
     * @param  string  $data
     * @return bool
     */
    private function isValidPhoto(string $data): bool
    {
        return $this->isBinary($data) || $this->isDataUrl($data) || $this->isBase64($data);
    }

    /**
     * Determines if source data is binary data.
     *
     * @param  string  $data
     * @return bool
     */
    private function isBinary(string $data): bool
    {
        $mime = finfo_buffer(finfo_open(FILEINFO_MIME_TYPE), $data); // @phpstan-ignore-line

        return substr($mime, 0, 4) != 'text' && $mime != 'application/x-empty';
    }

    /**
     * Determines if source data is data-url format.
     *
     * @param  string  $data
     * @return bool
     */
    private function isDataUrl(string $data): bool
    {
        if (! is_string($data)) {
            return false;
        }

        $pattern = "/^data:(?:image\/[a-zA-Z\-\.]+)(?:charset=\".+\")?;base64,(?P<data>.+)$/";
        preg_match($pattern, $data, $matches);

        if (is_array($matches) && Arr::has($matches, 'data')) {
            return ! empty(base64_decode($matches['data']));
        }

        return false;
    }

    /**
     * Determines if source data is base64 encoded.
     *
     * @param  string  $data
     * @return bool
     */
    private function isBase64(string $data): bool
    {
        if (! is_string($data)) {
            return false;
        }

        return base64_encode(base64_decode($data)) === str_replace(["\n", "\r"], '', $data);
    }
}
