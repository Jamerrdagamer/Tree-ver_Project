import React, { useState, useEffect } from 'react' 
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    FlatList,
    ActivityIndicator,
} from 'react-native'
import { Image } from 'expo-image'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { COLOURS } from '../../constants/theme'

export default function Guardian({ navigation }) {

    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState(null)
    const [status, setStatus] = useState(null)

    const [reason, setReason] = useState('')
    const [responsibilityTicked, setResponsibilityTicked] = useState(false)
    const [over16Ticked, setOver16Ticked] = useState(false)
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const [trees, setTrees] = useState([])
    const [myUpdates, setMyUpdates] = useState([])

    useEffect(() => {
        getGuardianInfo()
    }, [])

    async function getGuardianInfo() {
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser()
            if (!authUser) return

            const { data: profile } = await supabase
                .from('profiles')
                .select('username, guardian_status, guardian_retry_date')
                .eq('id', authUser.id)
                .single()

            if (profile) {
                const newUser = {
                    id: authUser.id,
                    email: authUser.email,
                    username: profile.username,
                    retryDate: profile.guardian_retry_date,
                }

                setUser(newUser)
                setStatus(profile.guardian_status)

                if (profile.guardian_status === 'approved') {
                    getAdoptedTrees(authUser.id)
                    getMyUpdates(authUser.id)
                }
            }

        } catch (err) {
            console.log('Guardian error:', err)
        }

        setLoading(false)
    }

    async function getAdoptedTrees(userId) {
        const { data, error } = await supabase
            .from('trees')
            .select('*')
            .eq('guardian_id', userId)
            .eq('is_adopted', true)

        if (error) {
            console.log('Adopted trees error:', error)
            return
        }

        setTrees(data || [])
    }


    async function getMyUpdates(userId) {
        const { data, error } = await supabase
            .from('guardian_updates')
            .select(`
                *,
                trees:tree_id (species, street_address)
            `)
            .eq('guardian_id', userId)
            .order('created_at', { ascending: false })

        if (error) {
            console.log('My updates error:', error)
            return
        }

        setMyUpdates(data || [])
    }

    function validateApplication() {
        if (reason === '') {
            setError('Please say why you want to be a guardian.')
            return false
        }

        if (reason.length > 150) {
            setError('Reason must be 150 characters or less.')
            return false
        }

        if (!responsibilityTicked) {
            setError('Please confirm you will look after the tree.')
            return false
        }

        if (!over16Ticked) {
            setError('Please confirm you are over 16.')
            return false
        }

        return true
    }

    async function handleApply() {
        setError('')

        if (!validateApplication()) {
            return
        }

        setSubmitting(true)

        try {
            const { error: applicationError } = await supabase
                .from('guardian_applications')
                .upsert({
                    user_id: user.id,
                    reason: reason,
                    responsibility_confirmed: responsibilityTicked,
                    over_16_confirmed: over16Ticked,
                    status: 'pending',
                    applied_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id',
                })

            if (applicationError) {
                console.log('Application error:', applicationError)
                setError('Application could not be sent.')
                setSubmitting(false)
                return
            }

            await supabase
                .from('profiles')
                .update({ guardian_status: 'pending' })
                .eq('id', user.id)

            setStatus('pending')

        } catch (err) {
            console.log('Apply catch error:', err)
            setError('Something went wrong.')
        }

        setSubmitting(false)
    }

    async function handleUnadopt(treeId) {
        await supabase
            .from('trees')
            .update({
                is_adopted: false,
                guardian_id: null,
                adopted_at: null,
            })
            .eq('id', treeId)

        setTrees(current => current.filter(tree => tree.id !== treeId))
    }

    function renderTree({ item }) {
        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <MaterialCommunityIcons
                        name="tree"
                        size={28}
                        color={COLOURS.primary}
                    />

                    <View style={styles.cardHeaderText}>
                        <Text style={styles.speciesName}>
                            {item.species || 'Unknown tree'}
                        </Text>

                        <Text style={styles.speciesDetails} numberOfLines={2}>
                            {item.description || 'No description available.'}
                        </Text>
                    </View>
                </View>

                <View style={styles.infoRow}>
                    <MaterialCommunityIcons
                        name="map-marker"
                        size={16}
                        color={COLOURS.textGrey}
                    />
                    <Text style={styles.infoText}>
                        {item.street_address || 'No address saved'}
                    </Text>
                </View>

                <View style={styles.cardActions}>
                    <TouchableOpacity
                        style={styles.updateButton}
                        onPress={() => navigation.navigate('GuardianUpdate', { tree: item })}
                    >
                        <Text style={styles.updateButtonText}>Post Update</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.unadoptButton}
                        onPress={() => handleUnadopt(item.id)}
                    >
                        <Text style={styles.unadoptButtonText}>Unadopt</Text>
                    </TouchableOpacity>
                </View>
            </View>
        )
    }

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLOURS.primary} />
            </View>
        )
    }

    if (!user) {
        return (
            <View style={styles.loadingContainer}>
                <Text>Could not load user.</Text>
            </View>
        )
    }

    if (status === 'pending') {
        return (
            <View style={styles.container}>
                <View style={styles.header} />

                <View style={styles.centerContent}>
                    <MaterialCommunityIcons
                        name="clock-outline"
                        size={80}
                        color={COLOURS.primary}
                    />

                    <Text style={styles.heading}>Application Pending</Text>

                    <Text style={styles.message}>
                        Your guardian application is waiting to be reviewed.
                    </Text>
                </View>
            </View>
        )
    }

    if (status === 'rejected') {
        return (
            <View style={styles.container}>
                <View style={styles.header} />

                <View style={styles.centerContent}>
                    <MaterialCommunityIcons
                        name="lock-outline"
                        size={80}
                        color={COLOURS.error}
                    />

                    <Text style={styles.heading}>Application Rejected</Text>

                    <Text style={styles.message}>
                        Your application was not accepted this time.
                    </Text>
                </View>
            </View>
        )
    }

    if (status === 'approved') {
        return (
            <View style={styles.container}>
                <View style={styles.header} />

                <FlatList
                    data={trees}
                    keyExtractor={item => item.id}
                    renderItem={renderTree}
                    contentContainerStyle={styles.listContent}
                    ListHeaderComponent={() => (
                        <>
                            <Text style={styles.screenTitle}>My Adopted Trees</Text>
                            <Text style={styles.description}>
                                These are the trees you are currently looking after.
                            </Text>
                        </>
                    )}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyBox}>
                            <MaterialCommunityIcons
                                name="tree-outline"
                                size={60}
                                color={COLOURS.textLight}
                            />
                            <Text style={styles.emptyText}>No adopted trees yet</Text>
                        </View>
                    )}
                    ListFooterComponent={() => (
                        <View style={{ marginTop: 24 }}>
                            <Text style={styles.screenTitle}>My Updates</Text>
                            <Text style={styles.description}>
                                All the updates you have posted about your trees.
                            </Text>

                            {myUpdates.length === 0 ? (
                                <View style={styles.emptyBox}>
                                    <MaterialCommunityIcons
                                        name="image-off-outline"
                                        size={60}
                                        color={COLOURS.textLight}
                                    />
                                    <Text style={styles.emptyText}>No updates posted yet</Text>
                                </View>
                            ) : (
                                myUpdates.map(update => (
                                    <View key={update.id} style={styles.updateCard}>
                                        <Image
                                            source={{ uri: update.image_url }}
                                            style={styles.updateImage}
                                            contentFit="cover"
                                        />
                                        <View style={styles.updateBody}>
                                            <Text style={styles.updateTreeName}>
                                                {update.trees?.species || 'Unknown tree'}
                                            </Text>
                                            {update.caption ? (
                                                <Text style={styles.updateCaption} numberOfLines={2}>
                                                    {update.caption}
                                                </Text>
                                            ) : null}
                                            <Text style={styles.updateDate}>
                                                {new Date(update.created_at).toLocaleDateString('en-GB', {
                                                    day: 'numeric',
                                                    month: 'long',
                                                    year: 'numeric',
                                                })}
                                            </Text>
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                    )}
                />
            </View>
        )
    }

    return (
        <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
        >
            <View style={styles.header} />

            <Text style={styles.screenTitle}>Become a Guardian</Text>

            <Text style={styles.description}>
                Guardians adopt trees and give updates about their condition.
            </Text>

            {error ? (
                <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            ) : null}

            <Text style={styles.label}>Username</Text>
            <View style={styles.autoFilledInput}>
                <Text style={styles.autoFilledText}>{user.username}</Text>
            </View>

            <Text style={styles.label}>Why do you want to be a guardian?</Text>
            <TextInput
                style={styles.textArea}
                value={reason}
                onChangeText={setReason}
                placeholder="Write your reason..."
                placeholderTextColor={COLOURS.textLight}
                multiline={true}
                maxLength={150}
            />

            <Text style={styles.charCount}>{reason.length}/150</Text>

            <TouchableOpacity
                style={styles.tickRow}
                onPress={() => setResponsibilityTicked(!responsibilityTicked)}
            >
                <MaterialCommunityIcons
                    name={responsibilityTicked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={22}
                    color={COLOURS.primary}
                />
                <Text style={styles.tickText}>
                    I will take responsibility for my adopted trees.
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.tickRow}
                onPress={() => setOver16Ticked(!over16Ticked)}
            >
                <MaterialCommunityIcons
                    name={over16Ticked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={22}
                    color={COLOURS.primary}
                />
                <Text style={styles.tickText}>
                    I confirm I am over 16.
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.button}
                onPress={handleApply}
                disabled={submitting}
            >
                {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                ) : (
                    <Text style={styles.buttonText}>Submit Application</Text>
                )}
            </TouchableOpacity>
        </ScrollView>
    )
}