import React, { useState } from 'react'
import {
        View,
        Text,
        TextInput,
        TouchableOpacity,
        StyleSheet,
        ScrollView,
        ActivityIndicator,
} from 'react-native'
import { Image } from 'expo-image'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import * as FileSystem from 'expo-file-system'
import { decode } from 'base64-arraybuffer'
import { supabase } from '../../lib/supabase'
import { COLOURS } from '../../constants/theme'


const OPENCAGE_API_KEY = process.env.EXPO_PUBLIC_OPENCAGE_KEY


const AVAILABLE_TAGS = [
        { id: 'healthy',  label: 'Healthy',  icon: 'heart' },
        { id: 'broken',   label: 'Broken',   icon: 'tree' },
        { id: 'diseased', label: 'Diseased', icon: 'virus' },
        { id: 'birds',    label: 'Birds',    icon: 'bird' },
        { id: 'insects',  label: 'Insects',  icon: 'bug' },
        { id: 'mammals',  label: 'Mammals',  icon: 'rabbit' },
]


function getTagStyle(tagId, isSelected) {
        if (!isSelected) {
                return { background: COLOURS.backgroundSecondary, text: COLOURS.textGrey }
        }
        if (tagId === 'healthy')  return COLOURS.tagHealthy
        if (tagId === 'broken')   return COLOURS.tagBroken
        if (tagId === 'diseased') return COLOURS.tagDiseased
        if (tagId === 'birds')    return COLOURS.tagBirds
        if (tagId === 'insects')  return COLOURS.tagInsects
        if (tagId === 'mammals')  return COLOURS.tagMammals
        return { background: COLOURS.backgroundSecondary, text: COLOURS.textGrey }
}

export default function Update({ route, navigation }) {

        const tree = route?.params?.tree || {
                id: '1',
                species: 'Unknown species',
                street_address: 'Charlton Kings, Cheltenham',
        }

        const [photo, setPhoto] = useState(null)
        const [location, setLocation] = useState(null)
        const [streetAddress, setStreetAddress] = useState(
            tree.street_address || 'Charlton Kings, Cheltenham'
        )
        const [caption, setCaption] = useState('')
        const [selectedTags, setSelectedTags] = useState([])
        const [loading, setLoading] = useState(false)
        const [submitting, setSubmitting] = useState(false)
        const [error, setError] = useState('')
        const [showPreview, setShowPreview] = useState(false)

        async function getStreetAddress(lat, lng) {
                try {
                        const response = await fetch(
                            `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lng}&key=${OPENCAGE_API_KEY}&limit=1`
                        )
                        const data = await response.json()

                        if (data.results && data.results.length > 0) {
                                setStreetAddress(data.results[0].formatted)
                        }
                } catch (err) {
                        console.log('OpenCage error:', err)
                }
        }

        async function handleTakePhoto() {
                setError('')

                const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync()
                if (cameraStatus !== 'granted') {
                        setError('Camera permission is required to post an update.')
                        return
                }

                const { status: locationStatus } = await Location.requestForegroundPermissionsAsync()
                if (locationStatus !== 'granted') {
                        setError('Location permission is required to post an update.')
                        return
                }

                const result = await ImagePicker.launchCameraAsync({
                        mediaTypes: ImagePicker.MediaTypeOptions.Images,
                        quality: 0.7,
                        allowsEditing: true,
                        aspect: [4, 3],
                })

                if (result.canceled) return

                setLoading(true)

                try {
                        const gpsLocation = await Location.getCurrentPositionAsync({
                                accuracy: Location.Accuracy.High,
                        })

                        const lat = gpsLocation.coords.latitude
                        const lng = gpsLocation.coords.longitude

                        await getStreetAddress(lat, lng)

                        setPhoto(result.assets[0])
                        setLocation({ lat, lng })

                } catch (err) {
                        setError('Could not get your location. Please try again.')
                } finally {
                        setLoading(false)
                }
        }

        function handleTagPress(tagId) {
                setSelectedTags(currentTags => {
                        if (currentTags.includes(tagId)) {
                                return currentTags.filter(t => t !== tagId)
                        } else if (tagId === 'healthy') {
                                return [...currentTags.filter(t => t !== 'broken' && t !== 'diseased'), tagId]
                        } else if (tagId === 'broken' || tagId === 'diseased') {
                                return [...currentTags.filter(t => t !== 'healthy'), tagId]
                        } else {
                                return [...currentTags, tagId]
                        }
                })
        }

        function validateUpdate() {
                if (!photo) {
                        setError('Please take a photo of the tree first.')
                        return false
                } else if (!location) {
                        setError('Location not captured. Please take a photo again.')
                        return false
                } else if (selectedTags.length === 0) {
                        setError('Please select at least one tag.')
                        return false
                } else if (caption.length > 200) {
                        setError('Caption must be 200 characters or less.')
                        return false
                } else {
                        return true
                }
        }

        function handleShowPreview() {
                setError('')
                if (!validateUpdate()) return
                setShowPreview(true)
        }

        async function handleSubmitUpdate() {
                setSubmitting(true)
                setError('')

                try {
                        const { data: { user } } = await supabase.auth.getUser()
                        if (!user) {
                                setError('You must be logged in to post an update.')
                                setSubmitting(false)
                                return
                        }

                        // ─────────────────────────────────────────────────────────
                        // Upload the photo to Supabase Storage
                        // Same pattern as AddPost — read as base64 then convert
                        // to ArrayBuffer because fetch().blob() doesn't work
                        // reliably in React Native for local files
                        // ─────────────────────────────────────────────────────────

                        const filename = `${user.id}/${Date.now()}.jpg`

                        let base64Photo

                        if (FileSystem.File) {
                                const file = new FileSystem.File(photo.uri)
                                base64Photo = await file.base64()
                        } else {
                                base64Photo = await FileSystem.readAsStringAsync(photo.uri, {
                                        encoding: 'base64',
                                })
                        }

                        const arrayBuffer = decode(base64Photo)

                        const { error: uploadError } = await supabase.storage
                            .from('guardian-updates')
                            .upload(filename, arrayBuffer, {
                                    contentType: 'image/jpeg',
                                    upsert: false,
                            })

                        if (uploadError) {
                                console.log('Upload error:', uploadError)
                                setError('Failed to upload photo. Please try again.')
                                setSubmitting(false)
                                return
                        }

                        const { data: { publicUrl } } = supabase.storage
                            .from('guardian-updates')
                            .getPublicUrl(filename)

                        // ─────────────────────────────────────────────────────────
                        // Save the update to the guardian_updates table
                        // ─────────────────────────────────────────────────────────

                        const { error: updateError } = await supabase
                            .from('guardian_updates')
                            .insert({
                                    guardian_id: user.id,
                                    tree_id: tree.id,
                                    image_url: publicUrl,
                                    caption: caption || null,
                                    tags: selectedTags,
                                    latitude: location.lat,
                                    longitude: location.lng,
                                    street_address: streetAddress,
                            })

                        if (updateError) {
                                console.log('Update insert error:', updateError)
                                setError('Failed to save update. Please try again.')
                                setSubmitting(false)
                                return
                        }

                        navigation.goBack()

                } catch (err) {
                        console.log('Submit update error:', err)
                        console.log('Submit update error message:', err.message)
                        setError('Something went wrong. Please try again.')
                } finally {
                        setSubmitting(false)
                }
        }

        if (showPreview) {
                return (
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                    >
                            <View style={styles.header} />

                            <View style={styles.previewHeadingRow}>
                                    <TouchableOpacity onPress={() => setShowPreview(false)}>
                                            <MaterialCommunityIcons
                                                name="arrow-left"
                                                size={24}
                                                color={COLOURS.textDark}
                                            />
                                    </TouchableOpacity>
                                    <Text style={styles.screenTitle}>Preview Update</Text>
                                    <View style={{ width: 24 }} />
                            </View>

                            {/* Show error on preview screen so submission errors are visible */}
                            {error ? (
                                <View style={styles.errorBox}>
                                        <Text style={styles.errorText}>{error}</Text>
                                </View>
                            ) : null}

                            <View style={styles.treeBadge}>
                                    <MaterialCommunityIcons name="tree" size={16} color={COLOURS.primary} />
                                    <Text style={styles.treeBadgeText}>{tree.species}</Text>
                            </View>

                            <Image
                                source={{ uri: photo.uri }}
                                style={styles.previewImage}
                                contentFit="cover"
                            />

                            <View style={styles.tagsRow}>
                                    {selectedTags.map(tagId => {
                                            const tag = AVAILABLE_TAGS.find(t => t.id === tagId)
                                            const tagStyle = getTagStyle(tagId, true)
                                            return (
                                                <View
                                                    key={tagId}
                                                    style={[styles.tag, { backgroundColor: tagStyle.background }]}
                                                >
                                                        <Text style={[styles.tagText, { color: tagStyle.text }]}>
                                                                {tag.label}
                                                        </Text>
                                                </View>
                                            )
                                    })}
                            </View>

                            {caption ? (
                                <Text style={styles.previewCaption}>{caption}</Text>
                            ) : (
                                <Text style={styles.previewNoCaption}>No caption added</Text>
                            )}

                            <View style={styles.previewLocationRow}>
                                    <MaterialCommunityIcons name="map-marker" size={18} color={COLOURS.primary} />
                                    <Text style={styles.previewLocation}>{streetAddress}</Text>
                            </View>

                            <TouchableOpacity
                                style={styles.button}
                                onPress={handleSubmitUpdate}
                                disabled={submitting}
                            >
                                    {submitting ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <Text style={styles.buttonText}>Confirm and Post Update</Text>
                                    )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.secondaryButton}
                                onPress={() => setShowPreview(false)}
                            >
                                    <Text style={styles.secondaryButtonText}>Go Back and Edit</Text>
                            </TouchableOpacity>

                    </ScrollView>
                )
        }

        return (
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >

                    <View style={styles.header} />

                    <View style={styles.titleRow}>
                            <TouchableOpacity onPress={() => navigation.goBack()}>
                                    <MaterialCommunityIcons
                                        name="arrow-left"
                                        size={24}
                                        color={COLOURS.textDark}
                                    />
                            </TouchableOpacity>
                            <Text style={styles.screenTitle}>Post Update</Text>
                            <View style={{ width: 24 }} />
                    </View>

                    <View style={styles.treeBadge}>
                            <MaterialCommunityIcons name="tree" size={16} color={COLOURS.primary} />
                            <Text style={styles.treeBadgeText}>{tree.species}</Text>
                    </View>

                    {error ? (
                        <View style={styles.errorBox}>
                                <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    <Text style={styles.sectionLabel}>Photo</Text>

                    {loading ? (
                        <View style={styles.cameraButton}>
                                <ActivityIndicator size="large" color={COLOURS.primary} />
                                <Text style={styles.cameraButtonText}>Getting your location...</Text>
                        </View>
                    ) : photo ? (
                        <View style={styles.photoContainer}>
                                <Image
                                    source={{ uri: photo.uri }}
                                    style={styles.photoPreview}
                                    contentFit="cover"
                                />
                                <TouchableOpacity
                                    style={styles.retakeButton}
                                    onPress={handleTakePhoto}
                                >
                                        <MaterialCommunityIcons name="camera-retake" size={18} color={COLOURS.primary} />
                                        <Text style={styles.retakeText}>Retake</Text>
                                </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={styles.cameraButton}
                            onPress={handleTakePhoto}
                        >
                                <MaterialCommunityIcons name="camera" size={40} color={COLOURS.textLight} />
                                <Text style={styles.cameraButtonText}>Tap to take a photo</Text>
                        </TouchableOpacity>
                    )}

                    <Text style={styles.sectionLabel}>Location</Text>
                    <View style={styles.locationRow}>
                            <MaterialCommunityIcons
                                name="map-marker"
                                size={20}
                                color={location ? COLOURS.primary : COLOURS.textLight}
                            />
                            <Text style={styles.locationText}>
                                    {streetAddress}
                            </Text>
                    </View>

                    <Text style={styles.sectionLabel}>Tags</Text>
                    <Text style={styles.sectionHint}>
                            Select at least one. Healthy cannot be combined with broken or diseased.
                    </Text>

                    <View style={styles.tagsGrid}>
                            {AVAILABLE_TAGS.map(tag => {
                                    const isSelected = selectedTags.includes(tag.id)
                                    const tagStyle = getTagStyle(tag.id, isSelected)
                                    return (
                                        <TouchableOpacity
                                            key={tag.id}
                                            style={[styles.tagButton, { backgroundColor: tagStyle.background }]}
                                            onPress={() => handleTagPress(tag.id)}
                                        >
                                                <MaterialCommunityIcons
                                                    name={tag.icon}
                                                    size={18}
                                                    color={tagStyle.text}
                                                />
                                                <Text style={[styles.tagButtonText, { color: tagStyle.text }]}>
                                                        {tag.label}
                                                </Text>
                                        </TouchableOpacity>
                                    )
                            })}
                    </View>

                    <Text style={styles.sectionLabel}>Caption</Text>
                    <Text style={styles.sectionHint}>Optional — max 200 characters</Text>
                    <TextInput
                        style={styles.captionInput}
                        placeholder="Describe the current state of the tree..."
                        placeholderTextColor={COLOURS.textLight}
                        value={caption}
                        onChangeText={setCaption}
                        maxLength={200}
                        multiline={true}
                        numberOfLines={3}
                    />
                    <Text style={styles.charCount}>{caption.length}/200</Text>

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleShowPreview}
                    >
                            <View style={styles.buttonInner}>
                                    <MaterialCommunityIcons name="eye" size={18} color="#FFFFFF" />
                                    <Text style={styles.buttonText}>Preview Update</Text>
                            </View>
                    </TouchableOpacity>

            </ScrollView>
        )
}