<?php
declare(strict_types=1);

function get_default_line_rules(): array
{
    return [
        [
            'pattern' => '^\\s*(?:\\*|•)\\s+',
            'replacement' => '- ',
            'flags' => '',
        ],
        [
            'pattern' => '^\\s*-\\s*\\[( |x)\\]\\s*',
            'replacement' => '- [$1] ',
            'flags' => 'i',
        ],
    ];
}

function sanitize_line_rules(array $rules): array
{
    $sanitized = [];
    foreach ($rules as $rule) {
        if (!is_array($rule)) {
            continue;
        }
        $pattern = isset($rule['pattern']) ? trim((string)$rule['pattern']) : '';
        if ($pattern === '' || str_contains($pattern, '~')) {
            continue;
        }
        $replacement = isset($rule['replacement']) ? (string)$rule['replacement'] : '';
        $flags = isset($rule['flags']) ? (string)$rule['flags'] : '';
        if ($flags !== '' && preg_match('/[^gimsuy]/', $flags)) {
            continue;
        }
        $regex = '~' . $pattern . '~' . $flags;
        if (@preg_match($regex, '') === false) {
            continue;
        }
        $sanitized[] = [
            'pattern' => $pattern,
            'replacement' => $replacement,
            'flags' => $flags,
        ];
    }
    return $sanitized;
}

function decode_line_rules_from_storage(?string $value): ?array
{
    if ($value === null) {
        return null;
    }
    $value = trim($value);
    if ($value === '') {
        return null;
    }
    $decoded = json_decode($value, true);
    if (!is_array($decoded)) {
        return null;
    }
    return $decoded;
}
